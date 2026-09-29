// Controlled tests for audit-i18n.cjs: each one breaks something on purpose and
// checks the audit reports it, then restores the file.
//
//   node scripts/test-audit-i18n.cjs
//
// A gate nobody has seen fail is not a gate. The four checks here cover the two
// that matter most in practice -- markup drift and cross-script contamination --
// plus key parity, because those are the ones that would let a half-applied
// translation batch through unnoticed. Both real incidents this audit was
// written for were invisible to a key-parity check: the key was present and the
// value was a non-empty string.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const AUDIT = path.join(__dirname, 'audit-i18n.cjs');

function runAudit() {
  try {
    execFileSync(process.execPath, [AUDIT], { encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status, out: String(error.stdout || '') };
  }
}

const saved = {};
function load(code) {
  const file = path.join(I18N_DIR, `${code}.json`);
  if (!saved[code]) saved[code] = fs.readFileSync(file, 'utf8');
  return file;
}
function restoreAll() {
  for (const [code, contents] of Object.entries(saved)) {
    fs.writeFileSync(path.join(I18N_DIR, `${code}.json`), contents, 'utf8');
  }
}

const tests = [
  {
    name: 'a translation drops the <strong> its English carries',
    code: 'tr',
    kind: 'markup-drift',
    break: (raw) => raw.replace(/<\/?strong>/g, ''),
  },
  {
    name: 'Japanese text gains a Korean fragment',
    code: 'ja',
    kind: 'cross-script',
    // Hangul into a Japanese string: the invisible corruption that was in
    // terms-p1-2 and that reading the page would not have surfaced.
    break: (raw) => raw.replace(/(ゼロ知識 AES-256-GCM & Argon2id)/, '$1 없'),
  },
  {
    name: 'Arabic text gains a Cyrillic fragment',
    code: 'ar',
    kind: 'cross-script',
    break: (raw) => raw.replace(/(معرفة صفرية AES-256-GCM و Argon2id)/, '$1 привет'),
  },
  {
    name: 'a key is removed from one locale',
    code: 'it',
    kind: 'legal-missing',
    break: (raw) => {
      const json = JSON.parse(raw);
      delete json['terms-governing'];
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
  {
    name: 'a value is emptied',
    code: 'es',
    kind: 'empty',
    break: (raw) => {
      const json = JSON.parse(raw);
      json['privacy-governing'] = '   ';
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
  {
    // The shape that actually occurred: a Japanese translation kept a template
    // token in a form the site never substitutes, `_INTEGER`. It is still a
    // non-empty string, so key parity, emptiness and script checks all pass it.
    name: 'a template token is left unsubstituted',
    code: 'pt',
    kind: 'template-leftover',
    break: (raw) => {
      const json = JSON.parse(raw);
      json['privacy-governing'] = 'Em caso de divergência, prevalece o texto em_{{LOCALE}}.';
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
  {
    // An unclosed brace, which is what a half-finished substitution leaves.
    name: 'a placeholder is left unclosed',
    code: 'fr',
    kind: 'template-leftover',
    break: (raw) => {
      const json = JSON.parse(raw);
      json['privacy-governing'] = 'En cas de divergence, le texte turc fait foi. Voir {{DOMAIN';
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
  {
    // The one that got through. Five header strings were written through a
    // shell pipeline that turned every non-Latin-1 code point into "?", so tr
    // read "A??k" and five locales read as runs of question marks. Key parity,
    // emptiness, script and markup all passed it, because "????" is a non-empty
    // string with no stray writing system and no missing tag.
    name: 'a value is a run of replacement characters',
    code: 'ar',
    kind: 'letterless',
    break: (raw) => {
      const json = JSON.parse(raw);
      json['theme-light'] = '????';
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
];

let failures = 0;

for (const test of tests) {
  const file = load(test.code);
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, test.break(original), 'utf8');
  const result = runAudit();
  const reported = result.out.includes(test.kind);
  fs.writeFileSync(file, original, 'utf8');
  if (reported) {
    console.log(`  caught   ${test.kind.padEnd(18)} ${test.name}`);
  } else {
    failures++;
    console.log(`  MISSED   ${test.kind.padEnd(18)} ${test.name}`);
  }
}

restoreAll();

const HTML_PAGES = ['privacy.html', 'terms.html'];

const htmlTests = [
  {
    name: 'a page references a key that does not exist',
    kind: 'dangling-ref',
    break: (raw) => raw.replace('data-i18n="privacy-h2-1"', 'data-i18n="privacy-h2-9"'),
  },
  {
    // The failure this check exists for: twenty translated legal strings that
    // nothing rendered, so the page stayed Turkish under a translated header.
    // The key is removed from the page and left in the dictionary, which is
    // what an incomplete edit looks like.
    name: 'a legal translation exists that no page references',
    kind: 'orphan-key',
    break: (raw) => raw.replace(/\s*data-i18n="privacy-h2-4"/, ''),
  },
  {
    // One key, two sentences. dl-desc was the download page's hero line and a
    // GitHub Releases note on the home page, and the dictionary matched only the
    // first, so the note rendered the hero copy in twelve languages. Nothing in
    // the JSON can show it: one key, one valid value.
    name: 'one key stands for two different sentences',
    kind: 'key-conflict',
    file: 'download/index.html',
    break: (raw) => raw.replace('data-i18n="dl-eyebrow"', 'data-i18n="dl-title"'),
  },
];

for (const test of htmlTests) {
  const page = test.file || 'privacy.html';
  const file = path.join(path.resolve(__dirname, '..'), page);
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, test.break(original), 'utf8');
  const result = runAudit();
  const reported = result.out.includes(test.kind);
  fs.writeFileSync(file, original, 'utf8');
  if (reported) {
    console.log(`  caught   ${test.kind.padEnd(18)} ${test.name}`);
  } else {
    failures++;
    console.log(`  MISSED   ${test.kind.padEnd(18)} ${test.name}`);
  }
}
void HTML_PAGES;

const clean = runAudit();
if (clean.code === 0) {
  console.log('  intact   the unmodified tree passes');
} else {
  failures++;
  console.log('  the unmodified tree FAILS; the tests above did not restore cleanly');
  console.log(clean.out.split('\n').slice(0, 8).map((l) => '    ' + l).join('\n'));
}

console.log(failures ? `Status: FAIL - ${failures}` : 'Status: PASS');
process.exit(failures ? 1 : 0);
