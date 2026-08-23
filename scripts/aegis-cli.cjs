#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const VERSION = '7.0.2.0';

// ─── WASM & Argon2id Runtime Setup ──────────────────────────────────────────

let wasmPolyfilled = false;
function ensureWasmPolyfill() {
  if (wasmPolyfilled) return;
  const wasmPath = path.join(__dirname, '..', 'node_modules', 'argon2-browser', 'dist', 'argon2.wasm');
  if (fs.existsSync(wasmPath)) {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (typeof url === 'string' && url.includes('argon2')) {
        return new Response(wasmBuffer, {
          headers: { 'Content-Type': 'application/wasm' },
        });
      }
      if (originalFetch) return originalFetch(url, options);
      throw new Error(`fetch not supported for: ${url}`);
    };
  }
  wasmPolyfilled = true;
}

async function deriveArgon2idKeyAsync(password, saltHex, kdfParams = {}) {
  ensureWasmPolyfill();
  const argon2 = require('argon2-browser');

  const memoryKiB = Number(kdfParams.memoryKiB) || 32768;
  const iterations = Number(kdfParams.iterations) || 3;
  const parallelism = Number(kdfParams.parallelism) || 1;
  const hashLength = Number(kdfParams.hashLength) || 32;

  const result = await argon2.hash({
    pass: password,
    salt: saltHex,
    type: argon2.ArgonType.Argon2id,
    hashLen: hashLength,
    time: iterations,
    mem: memoryKiB,
    parallelism,
  });

  return Buffer.from(result.hash);
}

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
    --vault-file <path>                  Path to Aegis encrypted backup file (.aegis or .json)
    --password <masterPassword>          (Optional) Master password for decryption
                                         [Notice: If omitted, prompts securely without echoing to shell history]

  vault get                              Get details for a specific item
    --vault-file <path>                  Path to Aegis encrypted backup file (.aegis or .json)
    --id <idOrTitle>                     Item ID or exact Title to retrieve
    --password <masterPassword>          (Optional) Master password for decryption

ENVIRONMENT VARIABLES:
  AEGIS_PASSWORD                         Pass master password securely via environment variable

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
  if (!fs.existsSync(wordsJsonPath)) {
    throw new Error(`Diceware wordlist file missing at '${wordsJsonPath}'. Refusing to generate low-entropy passphrase.`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(wordsJsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`Diceware wordlist file is corrupted (${err.message}). Refusing to generate low-entropy passphrase.`);
  }

  const words = Array.isArray(raw.english) && raw.english.length >= 100
    ? raw.english
    : Array.isArray(raw.turkish) && raw.turkish.length >= 100
      ? raw.turkish
      : null;

  if (!words) {
    throw new Error('Diceware wordlist contains insufficient words. Refusing to generate low-entropy passphrase.');
  }

  return words;
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

let cachedDicewarePool = null;

function getDicewarePool() {
  if (!cachedDicewarePool) {
    cachedDicewarePool = expandWordPool(loadDicewareWords());
  }
  return cachedDicewarePool;
}

function generateDicewarePassphrase(wordCount = 4) {
  const pool = getDicewarePool();
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(pool[secureRandomIndex(pool.length)]);
  }
  return words.join('-');
}

// ─── Vault Parsing Helpers ────────────────────────────────────────────────────

async function parseVaultEnvelope(filePath, password) {
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

  // Unencrypted CSV/JSON export (array of items)
  if (Array.isArray(envelope)) {
    return envelope;
  }

  // Aegis Vault encrypted envelope (Argon2id + AES-256-GCM)
  if (typeof envelope === 'object' && envelope !== null) {
    if (!password) {
      throw new Error('Vault file is encrypted. Master password is required for decryption.');
    }

    const { salt, iv, tag, payload, kdfParams, checksum } = envelope;

    if (!salt || !iv || !tag || !payload) {
      throw new Error('Encrypted vault envelope is missing required cryptographic fields (salt, iv, tag, payload).');
    }

    // Verify SHA-256 payload checksum if present
    if (checksum) {
      const calculatedChecksum = crypto.createHash('sha256').update(payload).digest('hex');
      if (calculatedChecksum.toLowerCase() !== String(checksum).toLowerCase()) {
        throw new Error('Vault envelope checksum mismatch: file may be corrupted or tampered with.');
      }
    }

    // Parse IV, Tag, Payload buffers (handling hex or base64)
    const ivBuf = /^[0-9a-fA-F]+$/.test(iv) ? Buffer.from(iv, 'hex') : Buffer.from(iv, 'base64');
    const tagBuf = /^[0-9a-fA-F]+$/.test(tag) ? Buffer.from(tag, 'hex') : Buffer.from(tag, 'base64');
    const payloadBuf = /^[0-9a-fA-F]+$/.test(payload) ? Buffer.from(payload, 'hex') : Buffer.from(payload, 'base64');

    let key;
    try {
      key = await deriveArgon2idKeyAsync(password, salt, kdfParams || {});
    } catch (err) {
      throw new Error(`KDF key derivation failed: ${err.message}`);
    }

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
      decipher.setAuthTag(tagBuf);
      const decrypted = Buffer.concat([decipher.update(payloadBuf), decipher.final()]).toString('utf8');
      const parsedItems = JSON.parse(decrypted);
      if (!Array.isArray(parsedItems)) {
        throw new Error('Decrypted vault payload is not an item array.');
      }
      return parsedItems;
    } catch (_decryptErr) {
      throw new Error('Failed to decrypt vault envelope: Incorrect master password or corrupted backup.');
    }
  }

  throw new Error('Unrecognized Aegis vault backup format.');
}

// ─── Secure Interactive Password Prompt ──────────────────────────────────────

function readPasswordPrompt(promptText = 'Enter Master Password: ') {
  if (process.env.AEGIS_PASSWORD) {
    return Promise.resolve(process.env.AEGIS_PASSWORD);
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin, terminal: false });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
      rl.once('error', reject);
      return;
    }

    stdout.write(promptText);
    let password = '';
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(wasRaw || false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(password);
          return;
        }
        if (ch === '\u0003') { // Ctrl+C
          stdin.setRawMode(wasRaw || false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.exit(130);
        } else if (ch === '\u0008' || ch === '\x7f') { // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          password += ch;
          stdout.write('*');
        }
      }
    }

    stdin.on('data', onData);
  });
}

// ─── Main CLI Router ─────────────────────────────────────────────────────────

async function main() {
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

    try {
      if (isDiceware) {
        console.log(generateDicewarePassphrase(4));
      } else {
        console.log(generateRandomPassword(length, useSymbols));
      }
    } catch (err) {
      console.error(`Generator Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'vault') {
    const fileIdx = args.indexOf('--vault-file');
    const passIdx = args.indexOf('--password');
    const idIdx = args.indexOf('--id');

    const filePath = fileIdx !== -1 ? args[fileIdx + 1] : null;
    let password = passIdx !== -1 ? args[passIdx + 1] : null;
    const targetId = idIdx !== -1 ? args[idIdx + 1] : null;

    if (!filePath) {
      console.error('Error: --vault-file <path> is required for vault operations.');
      process.exit(1);
    }

    if (password) {
      console.warn('[Security Notice] Providing passwords via command-line arguments may expose them in shell history. Consider using interactive prompt or AEGIS_PASSWORD environment variable.');
    } else {
      password = await readPasswordPrompt('Enter Master Password: ');
    }

    try {
      const items = await parseVaultEnvelope(filePath, password);

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
        const item = items.find((i) => i.id === targetId || (i.title && i.title.toLowerCase() === targetId.toLowerCase()));
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
  void main();
}

module.exports = {
  generateRandomPassword,
  generateDicewarePassphrase,
  loadDicewareWords,
  parseVaultEnvelope,
  deriveArgon2idKeyAsync,
};
