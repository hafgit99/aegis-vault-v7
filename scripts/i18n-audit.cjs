/**
 * @file scripts/i18n-audit.cjs
 * @description Automated CI audit script for AegisVault v7 i18n locales.
 * Verifies that all 12 supported language files contain exactly 100% matching translation keys.
 * Also enforces single-quoted key literals as the canonical style across every locale.
 * Exits with code 0 on success, code 1 on key parity mismatch or non-canonical key quoting.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const REFERENCE_LOCALE = 'en';

// N-2: the original pattern only matched single-quoted keys, so a key written
// as "vaultForm.saveFailed" was invisible to the audit. The locale therefore
// looked like it was MISSING a key that was physically present, and the real
// cause (quoting style) was never reported. Both quote styles are now parsed,
// and non-canonical (double-quoted) keys are surfaced as their own finding so
// the mistake is reported at the line it was made on.
const SINGLE_QUOTED_KEY = /^[ \t]*'([^']+)'[ \t]*:/gm;
const DOUBLE_QUOTED_KEY = /^[ \t]*"([^"]+)"[ \t]*:/gm;

function extractKeysFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const nonCanonicalKeys = [];
  let match;

  SINGLE_QUOTED_KEY.lastIndex = 0;
  while ((match = SINGLE_QUOTED_KEY.exec(content)) !== null) {
    keys.add(match[1]);
  }

  DOUBLE_QUOTED_KEY.lastIndex = 0;
  while ((match = DOUBLE_QUOTED_KEY.exec(content)) !== null) {
    keys.add(match[1]);
    nonCanonicalKeys.push({
      key: match[1],
      line: content.slice(0, match.index).split(/\r?\n/).length,
    });
  }

  return { keys, nonCanonicalKeys };
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

  const { keys: referenceKeys } = extractKeysFromFile(referenceFile);
  console.log(`Reference Locale [${REFERENCE_LOCALE}]: ${referenceKeys.size} total keys.\n`);

  let totalErrors = 0;
  let totalQuotingErrors = 0;

  for (const file of localeFiles) {
    const langCode = path.basename(file, '.ts');
    const filePath = path.join(LOCALES_DIR, file);
    const { keys, nonCanonicalKeys } = extractKeysFromFile(filePath);

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

    if (nonCanonicalKeys.length > 0) {
      totalQuotingErrors++;
      totalErrors++;
      console.error(`  ❌ [${langCode.toUpperCase().padStart(2)}] ${file} — NON-CANONICAL KEY QUOTING (${nonCanonicalKeys.length})!`);
      for (const { key, line } of nonCanonicalKeys.slice(0, 5)) {
        console.error(`     ${file}:${line}: key "${key}" must use single quotes.`);
      }
    }
  }

  console.log('');
  if (totalErrors > 0) {
    const reasons = [];
    if (totalQuotingErrors > 0) reasons.push(`${totalQuotingErrors} locale(s) with non-canonical key quoting`);
    const parityErrors = totalErrors - totalQuotingErrors;
    if (parityErrors > 0) reasons.push(`${parityErrors} locale(s) with key parity failure`);
    console.error(`Status: BLOCKED — ${reasons.join(', ')}.`);
    process.exit(1);
  } else {
    console.log(`Status: PASS — All ${localeFiles.length} locale files verified with 100% key parity.`);
    process.exit(0);
  }
}

runAudit();
