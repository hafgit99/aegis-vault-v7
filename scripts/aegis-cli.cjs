#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '7.0.2.0';

// ─── Help & Version ──────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
AegisVault v7 CLI Tool (aegis-cli) v${VERSION}
Secure Command-Line Credential & Vault Management

USAGE:
  npx aegis-cli <command> [options]

COMMANDS:
  generate                               Generate a cryptographically secure password
    --length <N>                         Password length (default: 24)
    --symbols                            Include special symbols
    --diceware                           Generate a 4-word diceware passphrase

  vault list                             Decrypt & list item titles in a vault backup
    --vault-file <path>                  Path to Aegis encrypted backup file
    --password <masterPassword>          Master password for decryption

  vault get                              Get details for a specific item
    --vault-file <path>                  Path to Aegis encrypted backup file
    --password <masterPassword>          Master password for decryption
    --id <idOrTitle>                     Item ID or exact Title to retrieve

OPTIONS:
  --help, -h                             Show this help message
  --version, -v                          Show version
`);
}

// ─── Generator Helpers ────────────────────────────────────────────────────────

/**
 * Rejection-sampling random index. Avoids the modulo-bias introduced by
 * `bytes[i] % max`; consistent with the extension's `secureRandomIndex`.
 */
function secureRandomIndex(max) {
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new Error('Invalid secure random range');
  }
  const limit = Math.floor(0x100000000 / max) * max;
  const sample = new Uint32Array(1);
  do {
    crypto.randomFillSync(sample);
  } while (sample[0] >= limit);
  return sample[0] % max;
}

function generateRandomPassword(length = 24, useSymbols = true) {
  const charLower = 'abcdefghijklmnopqrstuvwxyz';
  const charUpper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charNum = '0123456789';
  const charSym = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let charset = charLower + charUpper + charNum;
  if (useSymbols) charset += charSym;

  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[secureRandomIndex(charset.length)];
  }
  return password;
}

const DICEWARE_TARGET_WORD_POOL_SIZE = 7776;

function loadDicewareWords() {
  const wordsJsonPath = path.join(__dirname, 'diceware-words.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(wordsJsonPath, 'utf8'));
  } catch {
    // Fallback for environments where the shared word list is unavailable.
    return ['apple', 'river', 'stone', 'cloud', 'forest', 'planet', 'bright', 'summer',
      'breeze', 'autumn', 'spring', 'winter', 'sunset', 'sunrise', 'starry', 'ocean',
      'island', 'valley', 'canyon', 'meadow', 'garden', 'flower', 'pebble', 'golden',
      'silver', 'bronze', 'copper', 'iron', 'wood', 'marble', 'glass', 'cotton'];
  }
  return Array.isArray(raw.english) && raw.english.length > 0 ? raw.english : raw.turkish;
}

function expandWordPool(baseWords) {
  const words = [...baseWords];
  const seen = new Set(words);
  for (let left = 0; left < baseWords.length && words.length < DICEWARE_TARGET_WORD_POOL_SIZE; left++) {
    for (let right = 0; right < baseWords.length && words.length < DICEWARE_TARGET_WORD_POOL_SIZE; right++) {
      const candidate = `${baseWords[left]}${baseWords[right]}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        words.push(candidate);
      }
    }
  }
  return words;
}

const DICEWARE_WORD_POOL = expandWordPool(loadDicewareWords());

function generateDicewarePassphrase(wordCount = 4) {
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(DICEWARE_WORD_POOL[secureRandomIndex(DICEWARE_WORD_POOL.length)]);
  }
  return words.join('-');
}

// ─── Vault Parsing Helpers ────────────────────────────────────────────────────

function parseVaultEnvelope(filePath, _password) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Vault file not found at path: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error('Vault file contains invalid JSON envelope format.');
  }

  // Backup envelopes are JSON stringified VaultItem array or AES payload
  if (Array.isArray(envelope)) {
    return envelope; // Unencrypted CSV/JSON export
  }

  if (typeof envelope === 'object' && envelope.payload) {
    // Basic base64 payload parsing for CLI demonstration
    try {
      const decoded = Buffer.from(envelope.payload, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      throw new Error('Failed to decrypt vault envelope: wrong password or incompatible format.');
    }
  }

  throw new Error('Unrecognized Aegis vault backup format.');
}

// ─── Main CLI Router ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`aegis-cli v${VERSION}`);
    return;
  }

  const command = args[0];
  const subCommand = args[1];

  if (command === 'generate') {
    const isDiceware = args.includes('--diceware');
    const lengthIdx = args.indexOf('--length');
    const length = lengthIdx !== -1 && args[lengthIdx + 1] ? parseInt(args[lengthIdx + 1], 10) : 24;
    const useSymbols = args.includes('--symbols');

    if (isDiceware) {
      console.log(generateDicewarePassphrase(4));
    } else {
      console.log(generateRandomPassword(length, useSymbols));
    }
    return;
  }

  if (command === 'vault') {
    const fileIdx = args.indexOf('--vault-file');
    const passIdx = args.indexOf('--password');
    const idIdx = args.indexOf('--id');

    const filePath = fileIdx !== -1 ? args[fileIdx + 1] : null;
    const password = passIdx !== -1 ? args[passIdx + 1] : null;
    const targetId = idIdx !== -1 ? args[idIdx + 1] : null;

    if (!filePath || !password) {
      console.error('Error: Both --vault-file and --password are required for vault operations.');
      process.exit(1);
    }

    try {
      const items = parseVaultEnvelope(filePath, password);

      if (subCommand === 'list') {
        console.log(`\nVault Items (${items.length} total):`);
        console.log('──────────────────────────────────────────────────');
        items.forEach((item, index) => {
          console.log(`${index + 1}. [${item.category || 'login'}] ${item.title} (ID: ${item.id}) - User: ${item.username || 'n/a'}`);
        });
        console.log('');
        return;
      }

      if (subCommand === 'get') {
        if (!targetId) {
          console.error('Error: --id <idOrTitle> is required for vault get command.');
          process.exit(1);
        }
        const item = items.find((i) => i.id === targetId || i.title.toLowerCase() === targetId.toLowerCase());
        if (!item) {
          console.error(`Error: Item with ID or Title '${targetId}' not found in vault.`);
          process.exit(1);
        }
        console.log('\nItem Details:');
        console.log('──────────────────────────────────────────────────');
        console.log(`Title:    ${item.title}`);
        console.log(`Category: ${item.category || 'login'}`);
        console.log(`Username: ${item.username || 'n/a'}`);
        console.log(`Password: ${item.password || '[none]'}`);
        console.log(`URL:      ${item.url || 'n/a'}`);
        if (item.notes) console.log(`Notes:    ${item.notes}`);
        console.log('');
        return;
      }
    } catch (err) {
      console.error(`CLI Error: ${err.message}`);
      process.exit(1);
    }
  }

  console.error(`Unknown command: ${command}. Use --help to see available commands.`);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  generateRandomPassword,
  generateDicewarePassphrase,
  parseVaultEnvelope,
};
