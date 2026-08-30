/**
 * Tests for the aegis-cli vault envelope reader (KDF floor + decryption).
 * Runs under vitest (scripts glob picks up this test file).
 */
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deriveArgon2idKeyAsync, parseVaultEnvelope } from './aegis-cli.cjs';

const PASSWORD = 'correct horse battery staple';
const ITEMS = [{ id: 'i-1', title: 'Mail', username: 'a@b.c' }];

async function writeEnvelope(kdfParams) {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const iv = crypto.randomBytes(12);
  const key = await deriveArgon2idKeyAsync(PASSWORD, saltHex, kdfParams);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(ITEMS), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    salt: saltHex,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    payload: payload.toString('base64'),
    kdfParams,
    checksum: crypto.createHash('sha256').update(payload.toString('base64')).digest('hex'),
  };

  const file = path.join(os.tmpdir(), `aegis-cli-test-${crypto.randomUUID()}.aegis`);
  fs.writeFileSync(file, JSON.stringify(envelope));
  return file;
}

describe('aegis-cli parseVaultEnvelope', () => {
  it('decrypts a well-formed backup envelope with floor-respecting KDF params', async () => {
    const file = await writeEnvelope({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32 });
    const items = await parseVaultEnvelope(file, PASSWORD);
    expect(items).toEqual(ITEMS);
    fs.unlinkSync(file);
  });

  it('refuses envelopes below the 8192 KiB memory floor (anti-downgrade)', async () => {
    const file = await writeEnvelope({ memoryKiB: 4096, iterations: 3, parallelism: 1, hashLength: 32 });
    await expect(parseVaultEnvelope(file, PASSWORD)).rejects.toThrow(/weakened Argon2id parameters/);
    fs.unlinkSync(file);
  });

  it('refuses envelopes below the 3-iteration floor (anti-downgrade)', async () => {
    const file = await writeEnvelope({ memoryKiB: 32768, iterations: 2, parallelism: 1, hashLength: 32 });
    await expect(parseVaultEnvelope(file, PASSWORD)).rejects.toThrow(/weakened Argon2id parameters/);
    fs.unlinkSync(file);
  });

  it('rejects a wrong master password without leaking item data', async () => {
    const file = await writeEnvelope({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32 });
    await expect(parseVaultEnvelope(file, 'wrong-password')).rejects.toThrow(/Incorrect master password/);
    fs.unlinkSync(file);
  });
}, 60000);
