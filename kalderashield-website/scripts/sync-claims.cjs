/* Publishes the site's test-count claim from the test suite that actually runs.
 *
 *   node scripts/sync-claims.cjs            rewrite
 *   node scripts/sync-claims.cjs --check    verify only, non-zero if stale
 *
 * The homepage said "2.204 test" in a hardcoded attribute and in twelve
 * translation files. Nothing generated it, so it was nine tests behind the real
 * count by the time it was checked, and the only thing that could have caught
 * that was a person remembering to look. A security product publishing a stale
 * number about its own tests is the worst kind of wrong on a marketing page: it
 * is the one claim a visitor is most likely to check.
 *
 * The number now has one home -- `<meta name="x-test-count">`, present on every
 * page and written here from `vitest list` -- and everything else refers to it:
 *
 *   - site.js reads the meta and substitutes {{TESTCOUNT}} in the dictionary,
 *     formatted for the active locale, the same way {{VERSION}} already works.
 *   - The stat's data-count attribute carries the raw integer, because the
 *     counter animates it.
 *   - The markup fallback carries the formatted number, so the badge is still
 *     right with JavaScript off.
 *
 * The coverage figure is not injected: it is the threshold from
 * vitest.config.ts, and CI fails the build when real line coverage falls below
 * it. Publishing the floor rather than a measurement means the claim cannot
 * drift and cannot overstate. --check fails if the copy and the configured
 * threshold have parted ways, so a change to the threshold is a deliberate edit
 * rather than a silent one.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(siteRoot, '..');
const I18N = path.join(siteRoot, 'assets', 'js', 'i18n');
const BASE = 'en';
const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

/* Thousands separators actually in use across the twelve dictionaries: ASCII
 * full stop and comma, the non-breaking variants French and Russian use, and the
 * Arabic thousands mark. A plain space is deliberately NOT in it -- French
 * separates with U+202F, not U+0020, so treating U+0020 as a separator let the
 * match swallow the space that separates the number from the word. */
const SEP = '[.,\\u00a0\\u202f\\u2009\\u066c]';
/* A run of decimal digits with optional thousands separators.
 *
 * The first character must be a digit; everything after it may be a digit or a
 * separator. An earlier version wrote `[\p{Nd}][\p{Nd}]` and read it as "two
 * digits", so on "2.213" the second class was asked to match "." and the whole
 * pattern failed -- which is why the fallback check kept reporting the number as
 * missing while the markup beside it was perfectly correct. */
const NUM = '[\\p{Nd}](?:[\\p{Nd}]|' + SEP + ')*';

/* The templated form. Anchored: a value that merely mentions the token somewhere
 * is not a template this script can regenerate, and the check should say so. */
const TOKEN_RE = /^\{\{TESTCOUNT\}\}/;

const META_RE = /(<meta\s+name="x-test-count"\s+content=")(\d+)("\s*\/?>)/;
const COUNT_ATTR_RE = /(<span class="stat-num" data-count=")(\d+)(")/;

// Group 2 is the digits and separators; group 3 is the whitespace before the
// rest of the sentence plus the wording. Splitting them there is what keeps
// "2.213 test" from becoming "2.213test".
const FALLBACK_RE = new RegExp(
  '(<span data-i18n="badge-tests">)(\\s*' + NUM + ')(\\s*[^<]*)<\\/span>',
  'u'
);

function countTests() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let raw;
  try {
    raw = execFileSync(npx, ['vitest', 'list', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(
      'vitest list failed, so the claim cannot be regenerated. Run `npm run test:unit` first and check the output above.'
    );
  }
  const counted = trackedTests(JSON.parse(raw));
  const files = new Set(counted.map((t) => t.file));
  return { tests: counted.length, files: files.size };
}

/* `vitest list` walks the working tree, so it counts a test file that is not
 * committed yet. That is exactly what happened: scripts/verify-icons.test.mjs
 * existed in the author's tree, added nine tests, and the claim was regenerated
 * from 2213 -- while CI, which checks out the commit, runs 2204. The site then
 * published a number no build could reproduce, and `--check` failed on a tree
 * that was perfectly consistent.
 *
 * The claim describes what the repository ships, so it is counted from
 * `git ls-files`. A test that has not been committed is not part of the claim
 * until it is committed, at which point the next run counts it.
 *
 * Outside a git checkout -- an exported tarball, a release artifact -- there is
 * nothing to compare against, so the full working-tree count is used rather
 * than failing the gate over a missing .git. */
function trackedTests(list) {
  let tracked;
  try {
    tracked = new Set(
      execFileSync('git', ['ls-files'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      })
        .split(/\r?\n/)
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, '/'))
    );
  } catch {
    return list;
  }
  if (tracked.size === 0) return list;
  // `vitest list` reports absolute paths; git reports paths relative to the
  // repository root. Compared raw, nothing would ever match and the filter would
  // silently do nothing -- so both sides are normalised first.
  const root = repoRoot.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  const kept = list.filter((t) => {
    const file = String(t.file).replace(/\\/g, '/');
    const relative = file.startsWith(root) ? file.slice(root.length) : file;
    return tracked.has(relative);
  });
  if (kept.length === 0) {
    console.warn(
      ' uyari: hicbir test dosyasi git ile izlenmiyor gibi gorunuyor; islenmemis sayi kullanilacak.'
    );
    return list;
  }
  return kept;
}

/* The threshold the build actually enforces. Read from vitest.config.ts rather
 * than duplicated here, so raising the bar in one place does not leave the site
 * making a promise the build no longer keeps. */
function coverageFloor() {
  const cfg = fs.readFileSync(path.join(repoRoot, 'vitest.config.ts'), 'utf8');
  const block = /thresholds:\s*{([\s\S]*?)}\s*,?\s*\n\s*\}/.exec(cfg);
  if (!block) throw new Error('vitest.config.ts: thresholds block not found');
  const lines = /^\s*lines:\s*(\d+)\s*,?\s*$/m.exec(block[1]);
  if (!lines) throw new Error('vitest.config.ts: thresholds.lines not found');
  return Number(lines[1]);
}

function format(locale, n) {
  return new Intl.NumberFormat(locale, { useGrouping: true }).format(n);
}

function htmlFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'assets' && dir !== siteRoot) continue;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) out.push(full);
    }
  };
  walk(siteRoot);
  // The template as well: build-pages.cjs renders the nineteen generated pages
  // from it, so the meta has to live there or those pages lose it on the next
  // regeneration. That is the same drift this whole script exists to prevent,
  // one level up.
  out.push(path.join(siteRoot, 'assets', 'templates', 'page.html'));
  return out;
}

function applyMeta(html, tests) {
  if (META_RE.test(html)) return html.replace(META_RE, `$1${tests}$3`);
  // Placed straight after the charset line so it survives anyone reordering the
  // head, and so it is present on the 404 too.
  return html.replace(/(<meta charset="[^"]*">)/, `$1\n<meta name="x-test-count" content="${tests}">`);
}

function applyCountAttr(html, tests) {
  return html.replace(COUNT_ATTR_RE, `$1${tests}$3`);
}

function applyFallback(html, tests) {
  // Groups: 1 opening tag, 2 the old number, 3 the whitespace plus the rest of
  // the sentence. Rebuilding it from the whitespace group is what keeps the
  // space: the Turkish value has one, Korean and Chinese have none. The closing
  // tag is outside group 3 and has to be re-emitted -- an earlier version that
  // folded it into the group deleted the element's own closing tag, and the
  // check below caught the malformed markup rather than the wrong number.
  return html.replace(FALLBACK_RE, (m, open, _old, tail) => open + format('tr', tests) + tail + '</span>');
}

/* The count is the first token of every locale's sentence, but "a number" is not
 * the same set of characters in twelve writing systems. French separates
 * thousands with U+202F, Arabic writes Arabic-Indic digits, Korean and Chinese
 * set the number straight against a CJK word with no space at all. An earlier
 * `[0-9.,]` class mangled four of the twelve -- it left "2" behind in French and
 * stranded "٢٢٠٤" next to the token in Arabic -- so the pattern below is
 * Unicode-aware: \p{Nd} covers every decimal digit set, and the separator class
 * lists the four marks actually in use.
 */
const LEADING_NUMBER_RE = new RegExp('^' + NUM, 'u');

function rewriteDict(locale, tests) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = dict['badge-tests'];
  if (typeof before !== 'string') throw new Error(`${locale}.json has no badge-tests`);

  let after;
  if (TOKEN_RE.test(before)) {
    // Already templated. Re-running must be a no-op, not a second substitution.
    after = before;
  } else {
    const m = LEADING_NUMBER_RE.exec(before);
    if (!m) throw new Error(`${locale}.json badge-tests does not start with a number: ${before}`);
    const digits = m[0];
    if (!/\p{Nd}/u.test(digits)) throw new Error(`${locale}.json badge-tests has no digits to replace`);
    // Keep the space that separated the number from the word, so the template
    // still reads as a sentence and ko/zh stay correct without one.
    const rest = before.slice(digits.length).replace(/^\s+/, '');
    after = '{{TESTCOUNT}}' + (rest ? ' ' + rest : '');
    dict['badge-tests'] = after;
    fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  }
  return { before, after, wrote: after !== before };
}

function checkCoverageClaim(floor) {
  const problems = [];
  // The base locale is the reference for every other check in this repo, so it
  // is the reference here too: the configured floor has to appear in the copy.
  // `dict` IS en.json, so its keys are the copy's keys -- not dict[BASE].
  const base = JSON.parse(fs.readFileSync(path.join(I18N, BASE + '.json'), 'utf8'))['badge-tests'];
  if (typeof base !== 'string' || !base.includes(String(floor))) {
    problems.push(
      `vitest.config.ts sets lines: ${floor} but ${BASE}.json badge-tests does not mention ${floor}. ` +
        'The site quotes the enforced floor; either restore the number or update the copy deliberately.'
    );
  }
  // Every locale must carry the token, or that language shows a raw placeholder.
  for (const locale of LOCALES) {
    const d = JSON.parse(fs.readFileSync(path.join(I18N, locale + '.json'), 'utf8'));
    const v = d['badge-tests'];
    if (typeof v !== 'string' || !TOKEN_RE.test(v)) {
      problems.push(`${locale}.json badge-tests does not start with {{TESTCOUNT}}`);
    }
  }
  return problems;
}

function main() {
  const check = process.argv.includes('--check');
  const { tests } = countTests();
  const floor = coverageFloor();
  console.log(`testler: ${tests} (${countTests().files} dosya)   kapsam esigi: lines ${floor}`);

  const dict = JSON.parse(fs.readFileSync(path.join(I18N, BASE + '.json'), 'utf8'));
  void dict;

if (check) {
    const problems = checkCoverageClaim(floor);

    // The meta is the single source and it has to be on every page, not just
    // the one that shows the badge: site.js reads it from whichever document it
    // is running in, and a page missing it renders the token stripped instead
    // of formatted.
    for (const file of htmlFiles()) {
      const html = fs.readFileSync(file, 'utf8');
      const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
      const meta = META_RE.exec(html);
      if (!meta) problems.push(`${rel}: <meta name="x-test-count"> yok`);
      else if (Number(meta[2]) !== tests) problems.push(`${rel}: x-test-count ${meta[2]} ama gercek ${tests}`);
    }

    const indexPath = path.join(siteRoot, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const attr = COUNT_ATTR_RE.exec(html);
    if (!attr) problems.push('index.html: data-count yok');
    else if (Number(attr[2]) !== tests) problems.push(`index.html: data-count ${attr[2]} ama gercek ${tests}`);

    const fb = FALLBACK_RE.exec(html);
    if (!fb) {
      problems.push('index.html: badge-tests fallback sayisi bulunamadi (acik veya kapanis etiketi eksik)');
    } else {
      // The no-JavaScript fallback has to be the formatted number followed by the
      // exact wording the Turkish dictionary carries. Comparing only the digits
      // let a run that had dropped the space ("2.213test") pass.
      const trSuffix = JSON.parse(fs.readFileSync(path.join(I18N, 'tr.json'), 'utf8'))['badge-tests']
        .replace(TOKEN_RE, '')
        .trim();
      const actual = (fb[2] + fb[3]).trim();
      const expected = (format('tr', tests) + ' ' + trSuffix).trim();
      if (actual !== expected) {
        problems.push(`index.html: badge-tests "${actual}" ama olmasi gereken "${expected}"`);
      }
    }

    if (problems.length) {
      console.error('Iddia gecersiz kildi:');
      for (const p of problems) console.error('  - ' + p);
      console.error('\n`node scripts/sync-claims.cjs` ile yenileyin.');
      process.exit(1);
    }
    console.log(`Durum: PASS - ${tests} test ve lines ${floor} esigi kopyayla uyumlu.`);
    return;
  }

  let changed = 0;
  for (const locale of LOCALES) {
    const { before, after, wrote } = rewriteDict(locale, tests);
    if (!wrote) continue;
    changed++;
    console.log(`  ${locale}.json: "${before}"  ->  "${after}"`);
  }

  const indexPath = path.join(siteRoot, 'index.html');
  let pages = 0;
  for (const file of htmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    let next = applyMeta(html, tests);
    if (file === indexPath) next = applyFallback(applyCountAttr(next, tests), tests);
    if (next === html) continue;
    fs.writeFileSync(file, next, 'utf8');
    pages++;
  }
  console.log(`  ${pages} HTML dosyasi guncellendi (${changed} dil).`);
}

if (require.main === module) main();

module.exports = { countTests, coverageFloor, format };
