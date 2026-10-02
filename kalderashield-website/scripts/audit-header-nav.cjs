// Every page must carry the download action in its header nav, and the nav must
// come from one place. This is the check whose absence let nineteen pages ship
// without it.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'assets' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const findings = [];
const files = walk(root).sort();

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');

  const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(html);
  if (!nav) {
    findings.push(`${rel}: <nav class="site-nav"> yok`);
    continue;
  }

  if (!/class="nav-cta"[^>]*href="\/download\/"/.test(nav[0])) {
    findings.push(`${rel}: menüde indir butonu yok`);
  }
  // The label has to live in its own element: site.js assigns with textContent
  // when a translation has no markup, which would delete a glyph placed
  // directly inside the anchor.
  if (!/<a class="nav-cta"[^>]*>\s*<svg[\s\S]*?<\/svg><span data-i18n="nav-download">/.test(nav[0])) {
    findings.push(`${rel}: indir butonunda etiket <span data-i18n="nav-download"> içinde değil`);
  }
  // The hamburger has to sit outside the nav. Below 768px the nav is
  // position:fixed with translateX(100%), so a button inside it goes off-screen
  // and the mobile menu cannot be opened at all.
  if (/<nav class="site-nav"[\s\S]*?class="nav-toggle"/.test(nav[0])) {
    findings.push(`${rel}: hamburger <nav> içinde, mobilde ekran dışında kalır`);
  }
  if (!/<\/nav>\s*<button type="button" class="nav-toggle"/.test(html)) {
    findings.push(`${rel}: hamburger </nav> hemen ardından değil`);
  }
}

const css = fs.readFileSync(path.join(root, 'assets', 'css', 'site.css'), 'utf8');
// The skip link was parked at left:-9999px, which creates no scrollbar in a
// left-to-right document but a real 10,000px one in every RTL locale. clip-path
// hides the box in place instead of moving it out of the document.
const skip = /\.skip-link\s*\{[\s\S]*?\}/.exec(css);
if (!skip) {
  findings.push('assets/css/site.css: .skip-link kuralı yok');
} else if (/left:\s*-\d/.test(skip[0])) {
  findings.push('assets/css/site.css: .skip-link left:-9999px ile park ediliyor (RTL yatay kaydırması)');
} else if (!/clip-path:\s*inset\(50%\)/.test(skip[0])) {
  findings.push('assets/css/site.css: .skip-link clip-path ile park edilmiyor');
}

console.log(`${files.length} sayfa tarandı.`);

if (!findings.length) {
  console.log('Durum: PASS - her sayfanin menüsünde indir butonu var, hamburger menünün disinda.');
  process.exit(0);
}

console.log('');
for (const f of findings) console.log('  ' + f);
console.log(`\nDurum: FAIL - ${findings.length} bulgu.`);
process.exit(1);