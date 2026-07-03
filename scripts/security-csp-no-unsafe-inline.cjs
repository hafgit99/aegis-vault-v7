const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const findings = [];

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function collectFiles(dir, extensions, out = []) {
  const absolute = path.join(rootDir, dir);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(rel, extensions, out);
      continue;
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(rel);
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const tauriConfig = JSON.parse(readText('src-tauri/tauri.conf.json'));
const csp = tauriConfig.app?.security?.csp || '';
const styleSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('style-src '));

if (!styleSrc) {
  findings.push('src-tauri/tauri.conf.json: missing style-src directive');
} else if (/['"]unsafe-inline['"]/.test(styleSrc)) {
  findings.push('src-tauri/tauri.conf.json: style-src must not include unsafe-inline');
}

if (/https:\/\/fonts\.googleapis\.com|https:\/\/fonts\.gstatic\.com/.test(csp)) {
  findings.push('src-tauri/tauri.conf.json: remote Google font origins are not required by the bundled build');
}

if (/https:\/\/lh3\.googleusercontent\.com/.test(csp)) {
  findings.push('src-tauri/tauri.conf.json: remote Google content origins are not allowed under strict privacy requirements');
}

for (const file of ['index.html', ...collectFiles('src', ['.tsx', '.ts', '.jsx', '.js'])]) {
  if (/\.(test|spec)\.[tj]sx?$/.test(file)) continue;
  const text = readText(file);
  const patterns = [
    { name: 'React inline style prop', regex: /style\s*=\s*\{/g },
    { name: 'HTML style block', regex: /<style\b/gi },
    { name: 'HTML inline style attribute', regex: /\sstyle\s*=\s*['"]/gi },
    { name: 'dangerouslySetInnerHTML', regex: /dangerouslySetInnerHTML/g },
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(text))) {
      findings.push(file + ':' + lineOf(text, match.index) + ': ' + pattern.name + ' is not allowed under strict security guidelines');
    }
  }
}

if (findings.length > 0) {
  console.error('CSP strict-style gate failed:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}

console.log('PASS CSP strict-style gate: no unsafe-inline style policy or production inline styles found.');
