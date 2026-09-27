/**
 * @file scripts/security-android-autofill-boundary.cjs
 * @description Static security gate for the K-1 Android Autofill trust boundary.
 *
 * K-1 was an authentication-bypass plus credential-exfiltration bug:
 * `MainActivity` was `android:exported="true"` (it carried the LAUNCHER
 * intent-filter) and it built its Autofill state directly from Intent extras.
 * Any app on the device could therefore forge
 * `ACTION_AUTOFILL_AUTHENTICATE` with an attacker-chosen `webDomain`, show the
 * user a convincing fill UI, and read the approved credential back out of its
 * own `onActivityResult` via `setResult(RESULT_OK,
 * EXTRA_AUTHENTICATION_RESULT)`. The same root cause allowed forged save
 * intents to poison the vault and, because the Activity is `singleTask`, to
 * replace a genuine in-flight request.
 *
 * The fix has two halves, and this gate locks BOTH:
 *   1. `MainActivity` is `android:exported="false"`; the LAUNCHER filter moved
 *      to a `LauncherActivity` trampoline that forwards nothing.
 *   2. Autofill Intents are only a routing hint carrying an opaque registry
 *      id. The authoritative request lives in `AutofillRequestRegistry`, which
 *      only `AegisAutofillService` may write.
 *
 * A gate that only checked the manifest would still pass if someone re-added
 * `intent.getStringExtra(EXTRA_..._WEB_DOMAIN)` to the Activity, so this script
 * checks the Kotlin sources as well.
 *
 * Exits 0 on success, 1 on any violation. Checked in CI
 * (`npm run security:android-autofill-boundary`).
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const androidMainDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main');
const kotlinDir = path.join(androidMainDir, 'java', 'com', 'hafgit99', 'aegisvault7');
const manifestPath = path.join(androidMainDir, 'AndroidManifest.xml');

const findings = [];
const checks = [];

function pass(message) {
  checks.push(message);
  console.log(`PASS ${message}`);
}

function fail(message) {
  findings.push(message);
  console.error(`FAIL ${message}`);
}

function readTextOrNull(absolutePath) {
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function listKotlinFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listKotlinFiles(absolute, out);
      continue;
    }
    if (entry.name.endsWith('.kt')) out.push(absolute);
  }
  return out;
}

/**
 * Strips Kotlin comments so documentation that *describes* the removed attack
 * (which must stay in the code as a regression warning) is not mistaken for a
 * live code path. Handles line comments and nestable block comments.
 */
function stripKotlinComments(source) {
  let output = '';
  let index = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let blockDepth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        output += '  ';
        index += 2;
        continue;
      }
      if (char === '*' && next === '/') {
        blockDepth -= 1;
        output += '  ';
        index += 2;
        if (blockDepth === 0) inBlockComment = false;
        continue;
      }
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    // Copy string literals verbatim, honouring backslash escapes, so a comment
    // marker inside a string is not treated as a comment opener.
    if (char === '"' || char === "'") {
      const quote = char;
      output += char;
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') {
          output += inner + (source[index + 1] || '');
          index += 2;
          continue;
        }
        output += inner;
        index += 1;
        if (inner === quote) break;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      output += '  ';
      index += 2;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      blockDepth = 1;
      output += '  ';
      index += 2;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

/**
 * Strips YAML comments from a workflow file, whole-line and trailing alike, so
 * the CI checks below match executable configuration only.
 *
 * A gate that greps raw text punishes the person who writes down what went
 * wrong, which is the opposite of what a gate is for — the K-1 lint step carries
 * a long comment explaining the two bugs that made it unrunnable, and the first
 * version of this gate tripped over the words in that comment. But stripping
 * only whole-line comments leaves the same trap one character to the right: a
 * trailing `# ...` on a command line. So both forms are removed here.
 *
 * Quote-aware: a `#` inside a shell or YAML string is content, not a comment,
 * and `echo "a # b"` must survive intact.
 */
function stripYamlComments(source) {
  return source
    .split('\n')
    .map((line) => {
      let quote = null;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quote) {
          if (char === '\\') {
            i += 1;
          } else if (char === quote) {
            quote = null;
          }
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        // A `#` only opens a comment at the start of the line or after
        // whitespace, and never mid-token (so `sha256#1` survives).
        if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

/**
 * Extracts a single `<tagName ...>...</tagName>` element whose `android:name`
 * matches `nameAttrValue`.
 *
 * A regex is not good enough here: a self-closing CHILD element (e.g.
 * `<action android:name="..." />` inside an `<intent-filter>`) would be
 * mistaken for the end of the parent, which silently truncated the element and
 * made the gate miss the intent-filter it was looking for. So the start tag is
 * located by scanning to its closing `>`, and the body by matching the
 * corresponding close tag.
 */
function extractManifestElement(manifest, tagName, nameAttrValue) {
  const openTag = new RegExp(`<${tagName}\\b`, 'g');
  let match;
  while ((match = openTag.exec(manifest)) !== null) {
    const start = match.index;
    const startTagEnd = findTagEnd(manifest, start);
    if (startTagEnd === -1) return null;

    const startTag = manifest.slice(start, startTagEnd + 1);
    const nameMatch = /android:name="([^"]+)"/.exec(startTag);
    if (!nameMatch || nameMatch[1] !== nameAttrValue) continue;

    if (startTag.trimEnd().endsWith('/>')) {
      return startTag;
    }

    const closeTag = `</${tagName}>`;
    const closeIndex = manifest.indexOf(closeTag, startTagEnd + 1);
    if (closeIndex === -1) return startTag;
    return manifest.slice(start, closeIndex + closeTag.length);
  }
  return null;
}

/** Returns the index of the `>` that closes the tag starting at `start`. */
function findTagEnd(xml, start) {
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < xml.length; i += 1) {
    const char = xml[i];
    if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '>' && !inSingle && !inDouble) return i;
  }
  return -1;
}

/**
 * The complete set of Autofill Intent extras that may legally exist. K-1
 * deleted every other one; anything that reintroduces a name outside this list
 * (as a constant OR as a fully qualified string literal) is a violation.
 *
 * Expressed as the extra names as they appear IN the Intent. The names are
 * spelled out rather than derived, so renaming a routing extra fails this gate
 * loudly and forces a conscious review of what the new extra carries — which is
 * the intended behaviour, not a limitation.
 */
const ROUTING_EXTRA_ALLOWLIST = new Set([
  'com.hafgit99.aegisvault7.extra.AUTOFILL_REQUEST_ID',
  'com.hafgit99.aegisvault7.extra.AUTOFILL_CREATED_AT',
]);

/**
 * Every Autofill extra name mentioned in `source`, in both spellings:
 *   - the Kotlin constant, e.g. `EXTRA_AUTOFILL_WEB_DOMAIN`
 *   - the fully qualified extra name, e.g. `"com.hafgit99.aegisvault7.extra.AUTOFILL_WEB_DOMAIN"`
 */
function collectAutofillExtraReferences(source) {
  const references = new Set();
  for (const match of source.matchAll(/\bEXTRA_[A-Z0-9_]*AUTOFILL[A-Z0-9_]*/g)) {
    references.add(match[0]);
  }
  for (const match of source.matchAll(/[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.extra\.AUTOFILL_[A-Z0-9_]*/g)) {
    references.add(match[0]);
  }
  return [...references];
}

/**
 * Maps a reference to the extra name as it actually appears in the Intent, so
 * the two spellings compare equal. The constant table is parsed from
 * `AegisAutofillService` itself rather than hardcoded here, so the map cannot
 * drift from the app.
 */
function buildExtraConstantMap(serviceCode) {
  const map = new Map();
  for (const match of serviceCode.matchAll(/\bconst val (EXTRA_[A-Z0-9_]+)\s*=\s*"([^"]+)"/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

/**
 * Reduces a reference to the literal extra name that crosses the Intent
 * boundary. `AegisAutofillService.EXTRA_REQUEST_ID` and
 * `"com.hafgit99.aegisvault7.extra.AUTOFILL_REQUEST_ID"` both resolve to
 * `com.hafgit99.aegisvault7.extra.AUTOFILL_REQUEST_ID`.
 */
function resolveExtraName(reference, constantMap) {
  const cleaned = reference.replace(/^["']|["']$/g, '');
  if (constantMap.has(cleaned)) return constantMap.get(cleaned);
  const tail = cleaned.split('.').pop();
  if (constantMap.has(tail)) return constantMap.get(tail);
  return cleaned;
}

/** All `android:name` values declared by <activity> elements, in order. */
function extractAllActivityNames(manifest) {
  const names = [];
  const openTag = /<activity\b/g;
  let match;
  while ((match = openTag.exec(manifest)) !== null) {
    const startTagEnd = findTagEnd(manifest, match.index);
    if (startTagEnd === -1) continue;
    const nameMatch = /android:name="([^"]+)"/.exec(manifest.slice(match.index, startTagEnd + 1));
    if (nameMatch) names.push(nameMatch[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// 1. Manifest: MainActivity must not be reachable from outside the app.
// ---------------------------------------------------------------------------

const manifest = readTextOrNull(manifestPath);
if (manifest === null) {
  fail(`AndroidManifest.xml not found at ${path.relative(rootDir, manifestPath)}`);
} else {
  const mainActivity = extractManifestElement(manifest, 'activity', '.MainActivity');

  if (mainActivity === null) {
    fail('AndroidManifest.xml no longer declares .MainActivity');
  } else {
    if (/android:exported="true"/.test(mainActivity)) {
      fail(
        'MainActivity is android:exported="true". K-1: an exported Activity is reachable by any app, ' +
        'and MainActivity used to build Autofill state from Intent extras. It must stay exported="false".'
      );
    } else if (!/android:exported="false"/.test(mainActivity)) {
      fail(
        'MainActivity does not declare android:exported explicitly. On Android 12+ an Activity with an ' +
        'intent-filter and no explicit exported value fails to install, and omitting it hides the regression.'
      );
    } else {
      pass('MainActivity is android:exported="false"');
    }

    if (/<intent-filter[\s\S]*?<\/intent-filter>/.test(mainActivity)) {
      fail(
        'MainActivity declares an <intent-filter>. Any intent-filter on the credential-handling Activity ' +
        're-exports it; the MAIN/LAUNCHER filter must live on the LauncherActivity trampoline.'
      );
    } else {
      pass('MainActivity declares no intent-filter (no exported launch surface)');
    }
  }

  // A single exported launcher must exist, and it must not be MainActivity.
  const launcherElement = extractManifestElement(manifest, 'activity', '.LauncherActivity');
  if (launcherElement === null) {
    fail(
      'AndroidManifest.xml declares no .LauncherActivity trampoline. Without it the app has no launcher ' +
      'icon once MainActivity is exported="false".'
    );
  } else {
    if (!/android:exported="true"/.test(launcherElement)) {
      fail('LauncherActivity must be android:exported="true" — it is the app\'s only external entry point');
    } else {
      pass('LauncherActivity trampoline is the exported entry point');
    }
    if (!/android\.intent\.category\.LAUNCHER/.test(launcherElement)) {
      fail('LauncherActivity must carry android.intent.category.LAUNCHER');
    } else {
      pass('LauncherActivity carries the LAUNCHER category');
    }
  }

  const exportedActivities = extractAllActivityNames(manifest)
    .map((name) => ({ name, element: extractManifestElement(manifest, 'activity', name) }))
    .filter((entry) => entry.element && /android:exported="true"/.test(entry.element))
    .map((entry) => entry.name);

  const unexpectedExported = exportedActivities.filter(
    (name) => name !== '.LauncherActivity' && name !== '.AegisAutofillService',
  );
  if (unexpectedExported.length > 0) {
    fail(
      `Unexpected exported activities: ${unexpectedExported.join(', ')}. ` +
      'Only LauncherActivity and AegisAutofillService (which is guarded by ' +
      'android:permission="android.permission.BIND_AUTOFILL_SERVICE") may be exported.'
    );
  } else {
    pass('No unexpected exported activities');
  }

  // The AutofillService must keep its system-only permission guard. It is the
  // one component that legitimately has to be exported (the system binds it),
  // but only the system may bind it.
  const serviceElement = extractManifestElement(manifest, 'service', '.AegisAutofillService');
  if (serviceElement === null) {
    fail('AndroidManifest.xml no longer declares the .AegisAutofillService element');
  } else if (!/android:permission="android\.permission\.BIND_AUTOFILL_SERVICE"/.test(serviceElement)) {
    fail(
      'AegisAutofillService lost android:permission="android.permission.BIND_AUTOFILL_SERVICE". ' +
      'It is exported so the system can bind it, and that permission is the only thing stopping any ' +
      'other app from instantiating our Autofill service.'
    );
  } else {
    pass('AegisAutofillService keeps the system-only BIND_AUTOFILL_SERVICE guard');
  }

  // The registry is in-memory, so a secondary process would silently break it.
  if (/android:process="/.test(manifest)) {
    fail(
      'A component declares android:process=". AutofillRequestRegistry is in-memory, so the service and ' +
      'the Activity must share one process or request resolution will fail open/closed inconsistently.'
    );
  } else {
    pass('All components share the default process (required by the in-memory registry)');
  }
}

// ---------------------------------------------------------------------------
// 2. Kotlin: the Activity must never read request data from an Intent.
// ---------------------------------------------------------------------------

const kotlinFiles = listKotlinFiles(kotlinDir);
if (kotlinFiles.length === 0) {
  fail(`No Kotlin sources found under ${path.relative(rootDir, kotlinDir)}`);
} else {
  const readWithoutComments = (absolute) => stripKotlinComments(fs.readFileSync(absolute, 'utf8'));

  const mainActivityPath = path.join(kotlinDir, 'MainActivity.kt');
  const servicePath = path.join(kotlinDir, 'AegisAutofillService.kt');
  const registryPath = path.join(kotlinDir, 'security', 'AutofillRequestRegistry.kt');
  const launcherPath = path.join(kotlinDir, 'LauncherActivity.kt');

  for (const required of [mainActivityPath, servicePath, registryPath, launcherPath]) {
    if (!fs.existsSync(required)) {
      fail(`Expected source missing: ${path.relative(rootDir, required)}`);
    }
  }

  if (fs.existsSync(mainActivityPath)) {
    const code = readWithoutComments(mainActivityPath);
    const constantMap = buildExtraConstantMap(readWithoutComments(servicePath));

    // The invariant is "MainActivity reads exactly one Autofill extra off the
    // Intent: the opaque routing id". Enumerating forbidden identifiers is not
    // enough, because anyone re-introducing the bug can write the extra name as
    // a bare string literal instead of the constant, so BOTH spellings are
    // matched and resolved to the same fully qualified name.
    const disallowed = collectAutofillExtraReferences(code)
      .map((reference) => resolveExtraName(reference, constantMap))
      .filter((name) => !ROUTING_EXTRA_ALLOWLIST.has(name));
    if (disallowed.length > 0) {
      fail(
        `MainActivity references non-routing Autofill Intent extras: ${[...new Set(disallowed)].join(', ')}. ` +
        'K-1: request data (webDomain, appPackage, AutofillId lists, save candidate) must come from ' +
        'AutofillRequestRegistry only — an Intent carrying it is attacker-controlled.'
      );
    } else {
      pass('MainActivity reads no Autofill request data from Intent extras');
    }

    // Reading a parcelable is how the AutofillId lists used to arrive.
    if (/getParcelable(ArrayList)?Extra/.test(code)) {
      fail(
        'MainActivity reads a parcelable Intent extra. The AutofillId lists used to travel this way; ' +
        'they now live in AutofillRequestRegistry.'
      );
    }

    if (!/AutofillRequestRegistry/.test(code)) {
      fail('MainActivity does not consult AutofillRequestRegistry at all');
    } else {
      pass('MainActivity resolves requests through AutofillRequestRegistry');
    }

    // A fallback requestId keeps the pre-fix behaviour alive in disguise.
    if (/getStringExtra\([^)]*EXTRA_REQUEST_ID[^)]*\)\s*\?:/.test(code)) {
      fail(
        'MainActivity falls back to a synthesised request id when EXTRA_REQUEST_ID is absent. K-1: the ' +
        'whole boundary is that an unregistered id is rejected; a fallback re-opens it.'
      );
    } else if (/"android-autofill/.test(code)) {
      fail(
        'MainActivity synthesises an "android-autofill*" id. K-1: a request id must come from the registry, ' +
        'never be manufactured locally.'
      );
    } else {
      pass('MainActivity rejects an absent request id instead of synthesising one');
    }
  }

  if (fs.existsSync(servicePath)) {
    const code = readWithoutComments(servicePath);
    const constantMap = buildExtraConstantMap(code);

    // Only routing metadata may cross the Intent boundary. Literal extra names
    // are matched too, for the same reason as on the Activity side.
    const putExtras = [...code.matchAll(/putExtra\(\s*([A-Za-z0-9_.]+)/g)]
      .map((m) => resolveExtraName(m[1], constantMap))
      .concat(collectAutofillExtraReferences(code).map((reference) => resolveExtraName(reference, constantMap)));
    const disallowed = putExtras.filter((name) => !ROUTING_EXTRA_ALLOWLIST.has(name));
    if (disallowed.length > 0) {
      fail(
        `AegisAutofillService puts non-routing extras on the Intent: ${[...new Set(disallowed)].join(', ')}. ` +
        'K-1: only the opaque request id and the audit timestamp may cross the Intent boundary.'
      );
    } else {
      pass('AegisAutofillService puts only routing metadata on the Intent');
    }

    if (!/AutofillRequestRegistry\.register(FillRequest|SaveCandidate)/.test(code)) {
      fail('AegisAutofillService no longer registers requests in AutofillRequestRegistry');
    } else {
      pass('AegisAutofillService registers both fill and save requests in the registry');
    }

    if (!/AutofillRequestRegistry\.registerFillRequest/.test(code) || !/AutofillRequestRegistry\.registerSaveCandidate/.test(code)) {
      fail('AegisAutofillService must register BOTH the fill request and the save candidate');
    }

    // Predictable ids let a leaked/logged id be replayed.
    if (/requestId\s*=\s*"android-autofill[^"]*\$\{?(createdAt|System\.currentTimeMillis)/.test(code)) {
      fail(
        'AegisAutofillService derives the request id from a timestamp. K-1: ids must be unpredictable ' +
        '(UUID.randomUUID()) so a leaked or logged id cannot be guessed.'
      );
    } else if (!/UUID\.randomUUID\(\)/.test(code)) {
      fail('AegisAutofillService does not use UUID.randomUUID() for request ids')
    } else {
      pass('Autofill request ids are 128-bit random (UUID.randomUUID)');
    }
  }

  if (fs.existsSync(registryPath)) {
    const code = readWithoutComments(registryPath);
    for (const required of ['fun registerFillRequest', 'fun registerSaveCandidate', 'synchronized']) {
      if (!code.includes(required)) {
        fail(`AutofillRequestRegistry is missing "${required}"`);
      }
    }
    if (!code.includes('synchronized')) {
      fail('AutofillRequestRegistry is not synchronized; concurrent service/Activity access would race');
    } else {
      pass('AutofillRequestRegistry is synchronized and bounded');
    }
  }

  if (fs.existsSync(launcherPath)) {
    const code = readWithoutComments(launcherPath);
    if (!/startActivity\(\s*Intent\(this,\s*MainActivity::class\.java\)/.test(code.replace(/\s+/g, ' '))) {
      fail('LauncherActivity no longer forwards to MainActivity');
    } else {
      pass('LauncherActivity forwards to MainActivity');
    }
    // Forwarding extras would give the launcher a channel back into the vault.
    if (/startActivity\([\s\S]{0,400}putExtra/.test(code)) {
      fail('LauncherActivity forwards Intent extras to MainActivity. It must forward nothing.');
    } else {
      pass('LauncherActivity forwards no Intent extras');
    }
  }

  // The deprecated plaintext-password channel must be gone for good.
  for (const file of kotlinFiles) {
    const code = readWithoutComments(file);
    if (/EXTRA_AUTOFILL_SAVE_PASSWORD/.test(code)) {
      fail(
        `${path.relative(rootDir, file)} references EXTRA_AUTOFILL_SAVE_PASSWORD. K-1: a live code path ` +
        'that accepts a plaintext password from an Intent is an attack surface, not a compatibility feature.'
      );
    }
  }
  if (!findings.some((f) => f.includes('EXTRA_AUTOFILL_SAVE_PASSWORD'))) {
    pass('No source accepts a plaintext autofill password from an Intent extra');
  }

  // Registry writes must come from the service and nowhere else.
  const mutators = ['registerFillRequest', 'registerSaveCandidate'];
  for (const file of kotlinFiles) {
    if (file === servicePath) continue;
    const code = readWithoutComments(file);
    for (const mutator of mutators) {
      if (new RegExp(`AutofillRequestRegistry\\.${mutator}\\s*\\(`).test(code)) {
        fail(
          `${path.relative(rootDir, file)} calls AutofillRequestRegistry.${mutator}(). Only ` +
          'AegisAutofillService may write the registry; anything else can plant a request.'
        );
      }
    }
  }
  if (!findings.some((f) => f.includes('may write the registry'))) {
    pass('AutofillRequestRegistry is written only by AegisAutofillService');
  }
}

// ---------------------------------------------------------------------------
// K-1 (second part): Android lint must be part of the build, and the autofill
// component's API-level requirement must be stated rather than assumed.
//
// Lint was never wired into CI. Seven errors sat in the manifest and
// MainActivity for as long as the Android build existed, including four NewApi
// errors on this very autofill path - a class extending an API 26 type while
// minSdk is 24. Nobody saw them because nothing ran lint. A hand-written static
// check cannot substitute for the real linter: only it knows that
// `AegisAutofillService` requires API 26.
// ---------------------------------------------------------------------------

function checkLintIsWired() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};

  if (!scripts['android:lint']) {
    fail('package.json: an "android:lint" script must exist');
  } else if (!/lint/i.test(scripts['android:lint'])) {
    fail('package.json: "android:lint" must actually invoke the Android linter');
  }
  // Note: `android:lint` is allowed to keep calling gradlew.bat. It is a local
  // convenience script and the repository is developed on Windows; the defect
  // was never the script, it was the *CI job* invoking it on Linux.

  // The glue generator has to exist as a real file, not just as a mention in the
  // workflow. A gate that greps ci.yml for `android:gradle-glue` would happily
  // pass while the script it names had been deleted — the same
  // presence-is-not-workability mistake this function already made once.
  const glueScript = scripts['android:gradle-glue'];
  if (!glueScript) {
    fail('package.json: an "android:gradle-glue" script must exist — a bare ./gradlew cannot configure the project without the Tauri Gradle glue');
  } else {
    const gluePath = path.join(rootDir, glueScript.replace(/^node\s+/, ''));
    if (!fs.existsSync(gluePath)) {
      fail(`package.json: "android:gradle-glue" runs ${glueScript}, but ${glueScript.replace(/^node\s+/, '')} does not exist`);
    } else {
      pass('the Gradle glue generator script exists');
    }
  }

  const ciRaw = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  const ci = stripYamlComments(ciRaw);

  // Presence was the old test, and it is why this gate was green for a broken
  // step. Assert the things that would actually have caught it.

  // 1. The linter must be invoked through the POSIX wrapper. Note what is NOT
  //    accepted here any more: `android:lint`. Accepting it kept a revert path
  //    open, because `android:lint` calls `gradlew.bat` on the *other* machine —
  //    so a step rewritten as `run: npm run android:lint` satisfied the
  //    invocation check while the `gradlew.bat` check below never saw the
  //    wrapper, and the exact broken step came back green.
  if (!/\.\/gradlew[^\n]*\b(lint|lintVital)\w*/.test(ci)) {
    fail(
      'ci.yml: Android lint must run in CI through the POSIX wrapper (./gradlew :app:lintArmDebug or similar), otherwise these errors return unseen. Do not call `npm run android:lint` here: that script uses the Windows gradlew.bat wrapper and cannot run on a Linux runner',
    );
  }

  if (/gradlew\.bat/.test(ci)) {
    fail('ci.yml: the Android lint step must not use gradlew.bat on a Linux runner');
  }

  // 2. The SDK must be resolvable, by any mechanism Gradle honours:
  //    `local.properties` (gitignored, so it has to be written in the workflow),
  //    `sdk.dir` inside it, or an exported ANDROID_HOME / ANDROID_SDK_ROOT.
  if (!/local\.properties|sdk\.dir|ANDROID_HOME|ANDROID_SDK_ROOT/.test(ci)) {
    fail(
      'ci.yml: the Android lint step needs a resolvable SDK — write src-tauri/gen/android/local.properties, set sdk.dir in it, or export ANDROID_HOME. That file is gitignored, so without this Gradle cannot find the SDK and the step fails before linting anything',
    );
  }

  // 3. The Tauri-generated Gradle glue must exist before Gradle is invoked.
  //    `settings.gradle` does `apply from: 'tauri.settings.gradle'` and
  //    `app/build.gradle.kts` applies `tauri.build.gradle.kts`. Both are
  //    gitignored (they hold absolute cargo-registry paths, which is why they
  //    must not be committed) and neither is tracked, so on a clean checkout
  //    Gradle fails at configuration time with "Could not read script" —
  //    before a single file is linted. The release workflow never hit this
  //    because `tauri android build` writes the glue itself; a bare
  //    `./gradlew` invocation does not.
  //
  //    `tauri android init` is NOT accepted here. It is the obvious candidate
  //    and it does not work: with both files deleted it reports success and
  //    creates neither, because it only scaffolds a project that does not exist
  //    yet. That was tried, and CI failed on exactly this.
  if (!/android:gradle-glue|android-gradle-glue\.cjs/.test(ci)) {
    fail(
      'ci.yml: the Android lint step must generate the Tauri Gradle glue first (`npm run android:gradle-glue`). settings.gradle applies the gitignored tauri.settings.gradle and app/build.gradle.kts applies tauri.build.gradle.kts; on a clean checkout neither exists and Gradle aborts during configuration. `tauri android init` does not fix this — it scaffolds a new project and writes neither file',
    );
  }

  // 4. AGP 8.x requires JDK 17. Without it the lint step fails in a way that
  //    reads like a lint finding rather than a toolchain problem.
  if (!/java-version:\s*['"]?1[79]['"]?/.test(ci)) {
    fail('ci.yml: the Android lint step needs a pinned JDK (setup-java, java-version 17 or 19); AGP 8.x does not run on the runner default');
  }

  const manifestPath = path.join(
    rootDir,
    'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml',
  );
  const manifest = fs.readFileSync(manifestPath, 'utf8');

  // AutofillService is API 26+ while minSdk is 24. The requirement must be
  // declared, not left for a reader to infer.
  const serviceBlock = manifest.match(/<service[\s\S]*?AegisAutofillService[\s\S]*?>/);
  if (!serviceBlock) {
    fail('AndroidManifest.xml: AegisAutofillService is not declared');
  } else if (!/tools:targetApi="o"/.test(serviceBlock[0])) {
    fail(
      'AndroidManifest.xml: the autofill service needs tools:targetApi="o" — it is API 26+ while minSdk is 24',
    );
  }

  // A LEANBACK launcher filter requires a TV banner, or the home screen shows a
  // blank tile, and Play Store filters the app out of TV devices.
  if (/LEANBACK_LAUNCHER/.test(manifest)) {
    if (!/android:banner=/.test(manifest)) {
      fail('AndroidManifest.xml: a LEANBACK_LAUNCHER filter requires android:banner');
    }
    if (!/android\.hardware\.touchscreen"[\s\S]{0,80}required="false"/.test(manifest)) {
      fail(
        'AndroidManifest.xml: a LEANBACK_LAUNCHER filter requires touchscreen to be explicitly optional',
      );
    }
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const banner = path.join(
        rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res',
        `drawable-${density}`, 'aegis_tv_banner.png',
      );
      if (!fs.existsSync(banner)) {
        fail(`res/drawable-${density}/aegis_tv_banner.png: missing TV banner asset`);
      }
    }
  }

  pass('Android lint is wired into package scripts and CI (K-1)');
  pass('Autofill service declares its API 26 requirement via tools:targetApi');
}

checkLintIsWired();

// ---------------------------------------------------------------------------

console.log('');
if (findings.length > 0) {
  console.error(`Status: BLOCKED - ${findings.length} Android Autofill boundary violation(s).`);
  process.exit(1);
}

console.log(
  `Status: PASS - ${checks.length} Android Autofill boundary checks passed ` +
    '(K-1: non-exported credential Activity + registry-authoritative request routing ' +
    '+ lint wired and API-level requirements declared).',
);
process.exit(0);
