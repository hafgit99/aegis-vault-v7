// Rewrites the two header disclosures with consistent indentation.
//
//   node scripts/align-header-controls.cjs
//
// The block was patched in, then hand-adjusted, and the inner indentation drifted
// between the two controls. Cosmetic, but a header is the first thing anyone
// reads in the source. Replaces each block wholesale so the four pages are
// identical, and is a no-op once they are.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'download/index.html', 'privacy.html', 'terms.html'];

const BLOCKS = {
  lang: [
    '      <details class="lang">',
    '        <summary data-i18n-attr="aria-label:lang-switch-label">',
    '          <span class="lang-code" data-lang-code>TR</span>',
    '          <span data-lang-current>Türkçe</span>',
    '        </summary>',
    '        <div class="lang-menu" id="lang-menu"></div>',
    '      </details>',
  ].join('\n'),
  theme: [
    '      <details class="theme">',
    '        <summary data-i18n-attr="aria-label:theme-switch-label">',
    '          <span class="theme-glyph" aria-hidden="true">◐</span>',
    '          <span class="theme-current" data-theme-current data-i18n="theme-system">Sistem</span>',
    '        </summary>',
    '        <div class="theme-menu" id="theme-menu"></div>',
    '      </details>',
  ].join('\n'),
};

let changed = 0;
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  for (const [name, block] of Object.entries(BLOCKS)) {
    html = html.replace(
      new RegExp(`^ *<details class="${name}">[\\s\\S]*?^ *</details>$`, 'm'),
      block
    );
  }
  if (html !== before) {
    fs.writeFileSync(file, html, 'utf8');
    changed++;
  }
}
console.log(`realigned ${changed} of ${PAGES.length}`);
