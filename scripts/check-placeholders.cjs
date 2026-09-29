// Fails if the site still carries an unfilled {{DOMAIN}} token.
//
// The domain has not been chosen yet, so the canonical URLs, the contact
// address, the sitemap, security.txt and the install script all reference
// {{DOMAIN}}. That is deliberate: an obviously-unfilled token is greppable and
// impossible to miss, where a half-substituted real-looking domain is not.
//
// Run this before every deploy:
//
//   node scripts/check-placeholders.cjs
//
// It also refuses an AegisVault string, because the previous site's markup was
// full of them and a partial rebrand is exactly how they survived the first
// pass.

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'kalderashield-website');

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT = /\.(html|css|js|mjs|json|txt|xml|webmanifest|sh|md)$/i;

// The README is developer documentation for this directory, not a page anyone
// is served, and it necessarily discusses the rebrand and the placeholders by
// name. Checking it would mean the file could not explain the rule it is
// subject to.
const SKIP_FILES = new Set(['README.md']);

const placeholders = [];
const brandLeaks = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TEXT.test(entry.name)) continue;

    const relative = path.relative(SITE, full);
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      if (line.includes('{{DOMAIN}}')) {
        placeholders.push(`${relative}:${index + 1}`);
      }
      if (/aegis/i.test(line)) {
        brandLeaks.push(`${relative}:${index + 1}  ${line.trim().slice(0, 80)}`);
      }
    });
  }
}

walk(SITE);

if (brandLeaks.length) {
  console.error('Aegis references remain in the site:');
  brandLeaks.forEach((line) => console.error('  ' + line));
}

if (placeholders.length) {
  console.error('Unfilled {{DOMAIN}} placeholders (replace before deploying):');
  placeholders.forEach((line) => console.error('  ' + line));
  console.error(`\n${placeholders.length} placeholder(s) across the site.`);
}

if (placeholders.length || brandLeaks.length) {
  process.exit(1);
}

console.log('No unfilled placeholders and no Aegis references.');
