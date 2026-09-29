#!/usr/bin/env node
/* Rebrand/deploy gate: fails while any {{DOMAIN}} token, any "Aegis" remnant,
 * or any unfilled version placeholder remains in the deployable tree. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const findings = [];

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scripts') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel, out);
    else if (/\.(html|js|css|json|txt|xml|webmanifest|md|sh)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

for (const file of collect(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  if (text.includes('{{DOMAIN}}')) findings.push(`${rel}: unfilled {{DOMAIN}} token`);
  if (text.includes('{{VERSION}}')) findings.push(`${rel}: unfilled {{VERSION}} token`);
  if (/aegis/i.test(text)) findings.push(`${rel}: "Aegis" remnant (rebrand incomplete)`);
}

if (findings.length) {
  console.error('Placeholder gate failed:');
  for (const f of findings) console.error(' -', f);
  process.exit(1);
}
console.log('PASS: no placeholders, no rebrand remnants.');
