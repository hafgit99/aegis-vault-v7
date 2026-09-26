#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Y-16 / O-6: the Rust IPC boundary and the TypeScript Argon2id layer must agree
 * on which cost parameters are acceptable.
 *
 * They are two implementations of the same policy. When they drift, a vault that
 * unlocks on one runtime fails on the other, and — more importantly — a
 * parameter the desktop side refuses to honour could still be honoured by the
 * WASM path, reintroducing the denial of service the Rust ceiling exists to
 * stop. Nothing else in the test suite would notice.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const rustPath = path.join(rootDir, 'src-tauri', 'src', 'credential_handler.rs');
const tsPath = path.join(rootDir, 'src', 'lib', 'argon2id.ts');

const failures = [];

/** Reads `pub|export const NAME: T = value;` from a source file. */
function readConst(source, name) {
  const match = source.match(
    new RegExp(`(?:pub\\s+)?const\\s+${name}\\s*:\\s*u32\\s*=\\s*([^;]+);`),
  ) || source.match(
    new RegExp(`export\\s+const\\s+${name}\\s*(?::\\s*number)?\\s*=\\s*([^;]+);`),
  );
  if (!match) return null;
  const raw = match[1].trim();
  const evaluated = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim();
  // Only arithmetic on numeric literals is accepted; anything else is reported
  // rather than silently evaluated.
  if (!/^[\d\s*+()./-]+$/.test(evaluated)) return { expression: evaluated, value: null };
  // Safe: the expression has already been restricted to numeric literals and
  // arithmetic above, so there is no way for it to reach anything else.
  const value = Function(`"use strict";return (${evaluated});`)();
  return { expression: evaluated, value };
}

const rust = fs.readFileSync(rustPath, 'utf8');
const ts = fs.readFileSync(tsPath, 'utf8');

const PAIRS = [
  ['MIN_ARGON2ID_MEMORY_KIB', 'MIN_ARGON2ID_MEMORY_KIB'],
  ['MAX_ARGON2ID_MEMORY_KIB', 'MAX_ARGON2ID_MEMORY_KIB'],
  ['MIN_ARGON2ID_ITERATIONS', 'MIN_ARGON2ID_ITERATIONS'],
  ['MAX_ARGON2ID_ITERATIONS', 'MAX_ARGON2ID_ITERATIONS'],
  ['MIN_ARGON2ID_PARALLELISM', 'MIN_ARGON2ID_PARALLELISM'],
  ['MAX_ARGON2ID_PARALLELISM', 'MAX_ARGON2ID_PARALLELISM'],
  ['MIN_ARGON2ID_HASH_LENGTH', 'MIN_ARGON2ID_HASH_LENGTH'],
  ['MAX_ARGON2ID_HASH_LENGTH', 'MAX_ARGON2ID_HASH_LENGTH'],
];

for (const [rustName, tsName] of PAIRS) {
  const rustConst = readConst(rust, rustName);
  const tsConst = readConst(ts, tsName);

  if (!rustConst || rustConst.value === null) {
    failures.push(`credential_handler.rs: could not read ${rustName}`);
    continue;
  }
  if (!tsConst || tsConst.value === null) {
    failures.push(`argon2id.ts: could not read ${tsName} (found: ${tsConst ? tsConst.expression : 'nothing'})`);
    continue;
  }
  if (rustConst.value !== tsConst.value) {
    failures.push(
      `Argon2id bounds disagree: ${rustName} is ${rustConst.value} in Rust but ${tsConst.value} in TypeScript`,
    );
  }
}

// The error string is part of the contract too: it is what the UI and the logs
// match on, and the two runtimes must not produce different vocabularies.
const rustError = rust.match(/NO_ACTIVE_SESSION_ERROR|argon2id-parameter-out-of-range/) !== null;
const tsError = ts.includes('argon2id-parameter-out-of-range:');
if (rustError && !tsError) {
  failures.push('argon2id.ts: the "argon2id-parameter-out-of-range" error prefix must match the Rust boundary');
}

// The shipped profiles must stay inside the ceilings, on both sides.
for (const profile of ['DESKTOP_NATIVE_KDF_PROFILE', 'CROSS_PLATFORM_KDF_PROFILE']) {
  const block = ts.match(new RegExp(`${profile}[^}]*}`));
  if (!block) {
    failures.push(`argon2id.ts: could not locate ${profile}`);
    continue;
  }
  const memory = block[0].match(/memoryKiB:\s*([\d*+\s()]+)/);
  const iterations = block[0].match(/iterations:\s*(\d+)/);
  const maxMemory = readConst(ts, 'MAX_ARGON2ID_MEMORY_KIB');
  const maxIterations = readConst(ts, 'MAX_ARGON2ID_ITERATIONS');
  if (memory && maxMemory?.value !== null) {
    const value = Function(`"use strict";return (${memory[1].replace(/\s+/g, '')});`)();
    if (value > maxMemory.value) {
      failures.push(`${profile} requests ${value} KiB, above the ${maxMemory.value} KiB ceiling`);
    }
  }
  if (iterations && maxIterations?.value !== null && Number(iterations[1]) > maxIterations.value) {
    failures.push(`${profile} requests ${iterations[1]} iterations, above the ${maxIterations.value} ceiling`);
  }
}

if (failures.length > 0) {
  console.error('Status: FAIL — Argon2id boundary agreement checks failed:');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}

console.log('Status: PASS — the Rust and TypeScript Argon2id bounds agree.');
console.log(`  checked ${PAIRS.length} bound constants, the error prefix, and both shipped profiles`);
