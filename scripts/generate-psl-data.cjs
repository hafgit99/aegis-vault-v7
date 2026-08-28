#!/usr/bin/env node
/**
 * generate-psl-data.cjs — Regenerates the baked Public Suffix List data modules
 * used by the browser extension (src-extension/psl-data.generated.ts) and the
 * Rust IPC host (src-tauri/src/psl_data.generated.rs) from the committed
 * snapshot scripts/psl/public_suffix_list.dat.
 *
 * Why baked data: keeps builds network-independent and pins the list under our
 * own version control (supply-chain policy) instead of pulling it at runtime.
 * The snapshot is MPL-2.0 licensed (see LICENSE-3RD-PARTY.md). Refresh it with:
 *   curl -o scripts/psl/public_suffix_list.dat https://publicsuffix.org/list/public_suffix_list.dat
 *   node scripts/generate-psl-data.cjs
 *
 * Unicode rules are converted to punycode at generation time so the runtime
 * matchers never need IDN conversion.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { domainToASCII } = require('url');

const SNAPSHOT_PATH = path.join(__dirname, 'psl', 'public_suffix_list.dat');
const TS_OUT = path.join(__dirname, '..', 'src-extension', 'psl-data.generated.ts');
const RS_OUT = path.join(__dirname, '..', 'src-tauri', 'src', 'psl_data.generated.rs');

const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');

const icannRules = [];
const privateRules = [];
let section = icannRules;

for (const rawLine of raw.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (line.startsWith('// ===BEGIN PRIVATE DOMAINS')) {
    section = privateRules;
    continue;
  }
  if (line.startsWith('// ===END')) {
    continue;
  }
  if (!line || line.startsWith('//')) {
    continue;
  }

  // Convert every label to its ASCII (punycode) form; skip rules that cannot
  // be represented (none expected — PSL rules are valid domains/wildcards).
  const labels = line.split('.').map((label) => {
    if (label === '*' || label.startsWith('!')) {
      const rest = label.startsWith('!') ? label.slice(1) : label;
      const asciiRest = rest && rest.charCodeAt(0) > 127 ? domainToASCII(rest) : rest;
      return asciiRest ? (label.startsWith('!') ? `!${asciiRest}` : label) : '';
    }
    return label.charCodeAt(0) > 127 ? domainToASCII(label) : label;
  });

  if (labels.some((label) => !label)) {
    console.warn(`Skipping unparsable rule: ${line}`);
    continue;
  }
  section.push(labels.join('.').toLowerCase());
}

function uniqSorted(rules) {
  return Array.from(new Set(rules)).sort();
}

const icann = uniqSorted(icannRules);
const priv = uniqSorted(privateRules);
const total = icann.length + priv.length;

function tsArray(name, rules) {
  const body = rules.map((rule) => `  '${rule}',`).join('\n');
  return `export const ${name}: readonly string[] = [\n${body}\n];\n`;
}

const tsHeader = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: Mozilla Public Suffix List snapshot (scripts/psl/public_suffix_list.dat)
 * Snapshot SHA-256: ${sha256}
 * Rules: ${icann.length} ICANN + ${priv.length} PRIVATE = ${total}
 * Regenerate with: node scripts/generate-psl-data.cjs
 * List license: MPL-2.0 (see LICENSE-3RD-PARTY.md)
 */

`;

fs.writeFileSync(TS_OUT, tsHeader + tsArray('PSL_ICANN_RULES', icann) + '\n' + tsArray('PSL_PRIVATE_RULES', priv));

function rsArray(name, rules) {
  const body = rules.map((rule) => `    "${rule}",`).join('\n');
  return `pub const ${name}: &[&str] = &[\n${body}\n];\n`;
}

const rsHeader = `//! GENERATED FILE — do not edit by hand.
//! Source: Mozilla Public Suffix List snapshot (scripts/psl/public_suffix_list.dat)
//! Snapshot SHA-256: ${sha256}
//! Rules: ${icann.length} ICANN + ${priv.length} PRIVATE = ${total}
//! Regenerate with: node scripts/generate-psl-data.cjs

`;

fs.writeFileSync(RS_OUT, rsHeader + rsArray('PSL_ICANN_RULES', icann) + '\n' + rsArray('PSL_PRIVATE_RULES', priv));

console.log(`Generated ${path.basename(TS_OUT)} and ${path.basename(RS_OUT)}: ${total} rules (snapshot ${sha256.slice(0, 12)}…)`);
