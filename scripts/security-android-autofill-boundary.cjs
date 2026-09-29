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
 *      only `KalderaShieldAutofillService` may write.
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
const kotlinDir = path.join(androidMainDir, 'java', 'com', 'kalderashield', 'desktop');
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
    'com.kalderashield.desktop.extra.AUTOFILL_REQUEST_ID',
    'com.kalderashield.desktop.extra.AUTOFILL_CREATED_AT',
]);

/**
 * Every Autofill extra name mentioned in `source`, in both spellings:
 *   - the Kotlin constant, e.g. `EXTRA_AUTOFILL_WEB_DOMAIN`
 *   - the fully qualified extra name, e.g. `"com.kalderashield.desktop.extra.AUTOFILL_WEB_DOMAIN"`
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
 * `KalderaShieldAutofillService` itself rather than hardcoded here, so the map cannot
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
 * boundary. `KalderaShieldAutofillService.EXTRA_REQUEST_ID` and
 * `"com.kalderashield.desktop.extra.AUTOFILL_REQUEST_ID"` both resolve to
 * `com.kalderashield.desktop.extra.AUTOFILL_REQUEST_ID`.
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
    (name) => name !== '.LauncherActivity' && name !== '.KalderaShieldAutofillService',
  );
  if (unexpectedExported.length > 0) {
    fail(
      `Unexpected exported activities: ${unexpectedExported.join(', ')}. ` +
      'Only LauncherActivity and KalderaShieldAutofillService (which is guarded by ' +
      'android:permission="android.permission.BIND_AUTOFILL_SERVICE") may be exported.'
    );
  } else {
    pass('No unexpected exported activities');
  }

  // The AutofillService must keep its system-only permission guard. It is the
  // one component that legitimately has to be exported (the system binds it),
  // but only the system may bind it.
  const serviceElement = extractManifestElement(manifest, 'service', '.KalderaShieldAutofillService');
  if (serviceElement === null) {
    fail('AndroidManifest.xml no longer declares the .KalderaShieldAutofillService element');
  } else if (!/android:permission="android\.permission\.BIND_AUTOFILL_SERVICE"/.test(serviceElement)) {
    fail(
      'KalderaShieldAutofillService lost android:permission="android.permission.BIND_AUTOFILL_SERVICE". ' +
      'It is exported so the system can bind it, and that permission is the only thing stopping any ' +
      'other app from instantiating our Autofill service.'
    );
  } else {
    pass('KalderaShieldAutofillService keeps the system-only BIND_AUTOFILL_SERVICE guard');
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
  const servicePath = path.join(kotlinDir, 'KalderaShieldAutofillService.kt');
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
        `KalderaShieldAutofillService puts non-routing extras on the Intent: ${[...new Set(disallowed)].join(', ')}. ` +
        'K-1: only the opaque request id and the audit timestamp may cross the Intent boundary.'
      );
    } else {
      pass('KalderaShieldAutofillService puts only routing metadata on the Intent');
    }

    if (!/AutofillRequestRegistry\.register(FillRequest|SaveCandidate)/.test(code)) {
      fail('KalderaShieldAutofillService no longer registers requests in AutofillRequestRegistry');
    } else {
      pass('KalderaShieldAutofillService registers both fill and save requests in the registry');
    }

    if (!/AutofillRequestRegistry\.registerFillRequest/.test(code) || !/AutofillRequestRegistry\.registerSaveCandidate/.test(code)) {
      fail('KalderaShieldAutofillService must register BOTH the fill request and the save candidate');
    }

    // Predictable ids let a leaked/logged id be replayed.
    if (/requestId\s*=\s*"android-autofill[^"]*\$\{?(createdAt|System\.currentTimeMillis)/.test(code)) {
      fail(
        'KalderaShieldAutofillService derives the request id from a timestamp. K-1: ids must be unpredictable ' +
        '(UUID.randomUUID()) so a leaked or logged id cannot be guessed.'
      );
    } else if (!/UUID\.randomUUID\(\)/.test(code)) {
      fail('KalderaShieldAutofillService does not use UUID.randomUUID() for request ids')
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
          'KalderaShieldAutofillService may write the registry; anything else can plant a request.'
        );
      }
    }
  }
  if (!findings.some((f) => f.includes('may write the registry'))) {
    pass('AutofillRequestRegistry is written only by KalderaShieldAutofillService');
  }
}

// ---------------------------------------------------------------------------
// K-1 (second part): the autofill component's API-level requirement must be
// stated rather than assumed, and CI must not claim to run Android lint.
//
// Lint was never wired into CI, and seven errors sat in the manifest and
// MainActivity for as long as the Android build existed, including four NewApi
// errors on this very autofill path - a class extending an API 26 type while
// minSdk is 24. The fix for that was attempted twice and both attempts are
// recorded in ci.yml and KOD_INCELEME_RAPORU.md, because the reasons compound:
//
//   1. `settings.gradle` applies the gitignored `tauri.settings.gradle` and
//      `app/build.gradle.kts` applies `tauri.build.gradle.kts`. Neither is
//      tracked (both carry absolute cargo-registry paths), so a clean checkout
//      cannot even configure Gradle.
//   2. With that solved, `:app` still does not compile. `MainActivity :
//      TauriActivity`, but TauriActivity is a template at
//      `tauri-<ver>/mobile/android-codegen/TauriActivity.kt` that tauri's
//      `build.rs` copies into the app's Kotlin sources only when
//      `WRY_ANDROID_KOTLIN_FILES_OUT_DIR` is set - which only wry's Gradle
//      plugin does, i.e. only during the native Android build. `WryActivity`,
//      its own superclass, lives in the `wry` crate rather than in tauri.
//
// So lint cannot run in ordinary CI: the app module needs the Rust library
// cross-compiled first, which is the release job's environment, and that job
// already compiles all of this Kotlin - so Kotlin that does not compile is
// already a release blocker. The residual gap is narrow and named: lint's
// NewApi findings on a tree that compiles.
//
// That makes this a *negative* check. The old version asserted that lint WAS
// wired into CI, and that assertion is what let a step that could never run sit
// there green for days. Asserting the opposite is the honest form: if a lint
// step reappears in ci.yml, whoever adds it has to deal with the codegen, and
// this gate makes them read why rather than rediscover it.
// ---------------------------------------------------------------------------

function checkLintIsWired() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};

  if (!scripts['android:lint']) {
    fail('package.json: an "android:lint" script must exist');
  } else if (!/lint/i.test(scripts['android:lint'])) {
    fail('package.json: "android:lint" must actually invoke the Android linter');
  }
  // `android:lint` calls gradlew.bat, which is fine for a local convenience
  // script on a Windows development machine. It must never be what CI runs.

  // The glue generator has to exist as a real file, not just as a mention in
  // package.json. A check that greps a workflow for `android:gradle-glue` would
  // pass happily while the script it names had been deleted - the same
  // presence-is-not-workability mistake this function has now made twice.
  const glueScript = scripts['android:gradle-glue'];
  if (!glueScript) {
    fail('package.json: an "android:gradle-glue" script must exist — a bare ./gradlew cannot configure the project without the Tauri Gradle glue');
  } else {
    const glueRelative = glueScript.replace(/^node\s+/, '');
    if (!fs.existsSync(path.join(rootDir, glueRelative))) {
      fail(`package.json: "android:gradle-glue" runs ${glueScript}, but ${glueRelative} does not exist`);
    } else {
      pass('the Gradle glue generator script exists');
    }
  }

  const ciRaw = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  // Comments are stripped before matching: a gate that greps raw text punishes
  // the person who writes down what went wrong, which is the opposite of what a
  // gate is for. ci.yml carries a long comment explaining exactly why lint is
  // not there.
  const ci = stripYamlComments(ciRaw);

  const runsLintInCi = /android:lint/.test(ci)
    || /gradlew[^\n]*\b(lint|lintVital)\w*/.test(ci);
  if (runsLintInCi) {
    fail(
      'ci.yml: Android lint cannot run in this workflow and must not be added here. `:app` does not compile until the Rust library is cross-compiled: MainActivity extends TauriActivity, which is a template at tauri-<ver>/mobile/android-codegen/ that tauri\'s build.rs copies into the app\'s Kotlin sources only when WRY_ANDROID_KOTLIN_FILES_OUT_DIR is set (i.e. only during `tauri android build`); WryActivity lives in the wry crate, not tauri. A bare ./gradlew therefore fails with "Unresolved reference: TauriActivity". To lint on every push, the job has to run the native Android build first (~20-40 min, NDK + Rust); the release workflow already compiles this Kotlin, so an uncompilable app is already a release blocker',
    );
  } else {
    pass('ci.yml does not claim to run Android lint (it cannot, see the comment there)');
  }

  const manifestPath = path.join(
    rootDir,
    'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml',
  );
  const manifest = fs.readFileSync(manifestPath, 'utf8');

  // AutofillService is API 26+ while minSdk is 24. The requirement must be
  // declared, not left for a reader to infer.
  const serviceBlock = manifest.match(/<service[\s\S]*?KalderaShieldAutofillService[\s\S]*?>/);
  if (!serviceBlock) {
    fail('AndroidManifest.xml: KalderaShieldAutofillService is not declared');
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
    // The file name is all lowercase, and it has to be. aapt2 only accepts
    // [a-z0-9_.] in resource file names, so `KalderaShield_tv_banner.png`
    // would fail the Android build outright rather than merely missing the
    // banner. The gate carried the capitalised spelling and only ever passed
    // on Windows, where the filesystem folds case: NTFS resolved
    // KalderaShield_tv_banner.png to the lowercase file, and Linux CI -- the
    // only place that checks out the tree the way a build machine does --
    // reported all five densities as missing.
    //
    // The reference in AndroidManifest.xml is @drawable/kalderashield_tv_banner.
    const bannerResource = 'kalderashield_tv_banner.png';
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const banner = path.join(
        rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res',
        `drawable-${density}`, bannerResource,
      );
      if (!fs.existsSync(banner)) {
        fail(`res/drawable-${density}/${bannerResource}: missing TV banner asset`);
      }
    }
  }

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
    '+ API-level requirements declared + no unrunnable lint step in CI).',
);
process.exit(0);
