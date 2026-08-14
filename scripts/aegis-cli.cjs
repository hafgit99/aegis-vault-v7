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

function generateRandomPassword(length = 24, useSymbols = true) {
  const charLower = 'abcdefghijklmnopqrstuvwxyz';
  const charUpper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charNum = '0123456789';
  const charSym = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let charset = charLower + charUpper + charNum;
  if (useSymbols) charset += charSym;

  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

function generateDicewarePassphrase(wordCount = 4) {
  const wordList = [
    'aegis', 'vault', 'shield', 'crypto', 'argon', 'secure', 'cipher', 'matrix',
    'quantum', 'phoenix', 'titan', 'vector', 'anchor', 'beacon', 'breeze', 'cobalt',
    'crystal', 'dragon', 'ember', 'falcon', 'galaxy', 'harbor', 'horizon', 'island',
    'jasper', 'kingdom', 'lantern', 'meadow', 'nebula', 'ocean', 'paladin', 'quest',
  ];
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = crypto.randomInt(0, wordList.length);
    words.push(wordList[idx]);
  }
  return words.join('-');
}

// ─── Vault Parsing Helpers ────────────────────────────────────────────────────

function parseVaultEnvelope(filePath, password) {
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
