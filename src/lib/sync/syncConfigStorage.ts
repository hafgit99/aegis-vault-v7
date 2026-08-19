/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { S3SyncConfig, SyncConfig, WebDavSyncConfig } from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import type { WebCryptoAesGcmPayload } from '../webcrypto';
import { webCryptoAesGcmEncrypt, webCryptoAesGcmDecrypt, generateSafeIv } from '../webcrypto';
import { deriveArgon2idKey } from '../argon2id';
import { isPrivateOrLoopbackHostname } from '../airgapNetworkPolicy';

const CONFIG_STORAGE_KEY = 'aegis_sync_config_v1';

/**
 * Derives a 32-byte AES key from the master password specifically for
 * encrypting sync configuration. Uses a fixed salt suffix so we don't
 * need to store another random salt — the master password entropy is
 * sufficient since this is low-security metadata, not vault content.
 *
 * A separate HKDF-style domain label prevents key reuse with vault encryption.
 */
async function deriveConfigKey(masterPassword: string): Promise<Uint8Array> {
  // Deterministic but domain-separated salt
  const saltHex = Array.from(new TextEncoder().encode('aegis-sync-config-v1'))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return deriveArgon2idKey(masterPassword, saltHex, {
    memoryKiB: 16 * 1024, // 16 MB — lighter than vault KDF, config is low-risk
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  });
}

interface StoredSyncConfigEnvelope {
  version: 1;
  payload: WebCryptoAesGcmPayload;
}

/**
 * Encrypt and persist the sync configuration.
 * Credentials (WebDAV password, OAuth tokens) never touch localStorage in plaintext.
 */
export async function saveSyncConfig(config: SyncConfig, masterPassword: string): Promise<void> {
  if (config.type === 'disabled') {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    return;
  }

  const key = await deriveConfigKey(masterPassword);
  const payload = await webCryptoAesGcmEncrypt(JSON.stringify(config), key, generateSafeIv());

  const envelope: StoredSyncConfigEnvelope = { version: 1, payload };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Load and decrypt the sync configuration.
 * Returns `{ type: 'disabled' }` when no configuration is stored.
 */
export async function loadSyncConfig(masterPassword: string): Promise<SyncConfig> {
  const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!raw) return { type: 'disabled' };

  let envelope: StoredSyncConfigEnvelope;
  try {
    envelope = JSON.parse(raw) as StoredSyncConfigEnvelope;
  } catch {
    return { type: 'disabled' };
  }

  if (envelope.version !== 1 || !envelope.payload) {
    return { type: 'disabled' };
  }

  try {
    const key = await deriveConfigKey(masterPassword);
    const decrypted = await webCryptoAesGcmDecrypt(envelope.payload, key);
    return JSON.parse(decrypted) as SyncConfig;
  } catch {
    // Wrong password or corrupt data — treat as unconfigured
    throw new SyncError(
      syncErrorCodes.authFailed,
      'Failed to decrypt sync configuration — wrong master password or corrupt data.',
    );
  }
}

/** Remove all sync configuration from local storage. */
export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  localStorage.removeItem('aegis_sync_last_at');
}

/** Persist the timestamp of the last successful sync run. */
export function saveLastSyncTime(isoString: string): void {
  localStorage.setItem('aegis_sync_last_at', isoString);
}

/** Returns the ISO-8601 timestamp of the last successful sync, or null. */
export function getLastSyncTime(): string | null {
  return localStorage.getItem('aegis_sync_last_at');
}

/** Returns true if a sync configuration (non-disabled) is currently stored. */
export function hasSyncConfig(): boolean {
  return localStorage.getItem(CONFIG_STORAGE_KEY) !== null;
}

/** Validates a WebDAV config object for completeness before saving. */
export function validateWebDavConfig(cfg: Partial<WebDavSyncConfig>): string | null {
  if (!cfg.url || !cfg.url.trim()) return 'URL gereklidir.';
  try {
    const parsed = new URL(cfg.url);
    const isLocal = isPrivateOrLoopbackHostname(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      return 'Güvenlik için HTTPS gereklidir (yerel ağ adresleri muaf tutulur).';
    }
  } catch {
    return 'Geçersiz URL formatı.';
  }
  if (!cfg.username || !cfg.username.trim()) return 'Kullanıcı adı gereklidir.';
  if (!cfg.password || !cfg.password.trim()) return 'Şifre veya uygulama token gereklidir.';
  return null;
}

/** Validates an S3 config object for completeness before saving. */
export function validateS3Config(cfg: Partial<S3SyncConfig>): string | null {
  if (!cfg.endpoint || !cfg.endpoint.trim()) return 'S3 Endpoint URL gereklidir.';
  try {
    const parsed = new URL(cfg.endpoint);
    const isLocal = isPrivateOrLoopbackHostname(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      return 'Güvenlik için HTTPS gereklidir (yerel ağ adresleri muaf tutulur).';
    }
  } catch {
    return 'Geçersiz Endpoint URL formatı.';
  }
  if (!cfg.bucket || !cfg.bucket.trim()) return 'Bucket adı gereklidir.';
  if (!cfg.accessKeyId || !cfg.accessKeyId.trim()) return 'Access Key ID gereklidir.';
  if (!cfg.secretAccessKey || !cfg.secretAccessKey.trim()) return 'Secret Access Key gereklidir.';
  return null;
}
