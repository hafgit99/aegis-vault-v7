/**
 * @file scripts/i18n-audit.cjs
 * @description Automated CI audit script for AegisVault v7 i18n locales.
 * Verifies that all 12 supported language files contain exactly 100% matching translation keys.
 * Exits with code 0 on success, code 1 on key parity mismatch.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const REFERENCE_LOCALE = 'en';

function extractKeysFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  // Regex matches key definitions in object literals: 'key.name': 'val'
  const regex = /^\s*'([^']+)'\s*:/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function runAudit() {
  console.log('🌐 Starting Aegis Vault 7 Multi-Language Key Parity Audit...\n');

  if (!fs.existsSync(LOCALES_DIR)) {
    console.error(`❌ Error: Locales directory not found at ${LOCALES_DIR}`);
    process.exit(1);
  }

  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  if (localeFiles.length === 0) {
    console.error('❌ Error: No locale files found in src/i18n/locales');
    process.exit(1);
  }

  const referenceFile = path.join(LOCALES_DIR, `${REFERENCE_LOCALE}.ts`);
  if (!fs.existsSync(referenceFile)) {
    console.error(`❌ Error: Reference locale file ${REFERENCE_LOCALE}.ts not found`);
    process.exit(1);
  }

  const referenceKeys = extractKeysFromFile(referenceFile);
  console.log(`Reference Locale [${REFERENCE_LOCALE}]: ${referenceKeys.size} total keys.\n`);

  let totalErrors = 0;

  for (const file of localeFiles) {
    const langCode = path.basename(file, '.ts');
    const filePath = path.join(LOCALES_DIR, file);
    const keys = extractKeysFromFile(filePath);

    const missingKeys = [...referenceKeys].filter((k) => !keys.has(k));
    const extraKeys = [...keys].filter((k) => !referenceKeys.has(k));

    if (missingKeys.length === 0 && extraKeys.length === 0) {
      console.log(`  ✓ [${langCode.toUpperCase().padStart(2)}] ${file} — 100% PARITY (${keys.size}/${referenceKeys.size} keys)`);
    } else {
      totalErrors++;
      console.error(`  ❌ [${langCode.toUpperCase().padStart(2)}] ${file} — KEY PARITY FAILURE!`);
      if (missingKeys.length > 0) {
        console.error(`     Missing (${missingKeys.length}):`, missingKeys.slice(0, 5).join(', ') + (missingKeys.length > 5 ? '...' : ''));
      }
      if (extraKeys.length > 0) {
        console.error(`     Extra (${extraKeys.length}):`, extraKeys.slice(0, 5).join(', ') + (extraKeys.length > 5 ? '...' : ''));
      }
    }
  }

  console.log('');
  if (totalErrors > 0) {
    console.error(`Status: BLOCKED — ${totalErrors} locale(s) failed key parity check.`);
    process.exit(1);
  } else {
    console.log(`Status: PASS — All ${localeFiles.length} locale files verified with 100% key parity.`);
    process.exit(0);
  }
}

runAudit();
