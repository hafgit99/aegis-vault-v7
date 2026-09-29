// Rewrites the header controls on every page that has them.
//
//   node scripts/apply-header-controls.cjs
//
// The language disclosure gained the current endonym and a code badge, the
// incorrect role="menu" is gone, and a three-way theme control sits next to it.
// Four pages carry the header, so they are patched together rather than by hand.
//
// `role="menu"` was the one outright error: it promises menu semantics, and
// therefore arrow-key navigation, which these buttons do not implement. Screen
// readers announce a menu and then the menu does not behave like one. Plain
// buttons in a container need no role at all, so it is removed rather than
// half-implemented.
//
// The aria-labels move to data-i18n-attr so they are translated; "Language /
// Dil" was hardcoded in both languages on every page.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'download/index.html', 'privacy.html', 'terms.html'];

// Matches the existing block, which is identical on all four pages, and tolerates
// whitespace changes between them.
const OLD = /[ \t]*<details class="lang">\r?\n(?:.*\r?\n)*?[ \t]*<\/details>/;

const NEW = `        <details class="lang">
          <summary data-i18n-attr="aria-label:lang-switch-label">
            <span class="lang-code" data-lang-code>TR</span>
            <span data-lang-current>Türkçe</span>
          </summary>
          <div class="lang-menu" id="lang-menu"></div>
        </details>

        <details class="theme">
          <summary data-i18n-attr="aria-label:theme-switch-label">
            <span class="theme-glyph" aria-hidden="true">◐</span>
            <span class="theme-current" data-theme-current data-i18n="theme-system">Sistem</span>
          </summary>
          <div class="theme-menu" id="theme-menu"></div>
        </details>`;

let patched = 0;
let skipped = [];

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  // Read in a try rather than testing existsSync first. Checking and then
  // opening is a time-of-check to time-of-use gap -- CodeQL reports it as
  // js/file-system-race -- and here the two calls sit four lines apart doing
  // the same work. The catch also tells the two failures apart, which the
  // existsSync version could not.
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      skipped.push(`${page}: missing`);
    } else {
      skipped.push(`${page}: unreadable (${error && error.code})`);
    }
    continue;
  }
  if (!OLD.test(html)) {
    if (html.includes('class="theme"')) {
      skipped.push(`${page}: already patched`);
      continue;
    }
    skipped.push(`${page}: no language block found`);
    continue;
  }
  // OLD matches any <details class="lang"> block, including one this script
  // already produced, so re-running it re-indented the header on all four pages
  // and undid the alignment -- a script that damages the tree when you check
  // whether it still works is worse than no script. A page already carrying the
  // theme control and the keyed labels is done, whatever its indentation.
  if (html.includes('theme-switch-label') && html.includes('data-lang-code')) {
    skipped.push(`${page}: already patched`);
    continue;
  }
  fs.writeFileSync(file, html.replace(OLD, NEW), 'utf8');
  patched++;
  console.log(`  patched ${page}`);
}

for (const note of skipped) console.log(`  skipped ${note}`);
console.log(`patched ${patched} of ${PAGES.length}`);
