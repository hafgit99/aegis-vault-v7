import { invoke } from '@tauri-apps/api/core';

import { isAndroidRuntime, isDesktopRuntime } from './desktopStorage';

const MANIFEST_PATH = './aegis-integrity.json';
const MAX_ASSET_COUNT = 256;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface AssetIntegrityEntry {
  path: string;
  sha256: string;
  size: number;
}

export interface AssetIntegrityManifest {
  schemaVersion: 1;
  algorithm: 'SHA-256';
  rootSha256: string;
  assets: AssetIntegrityEntry[];
}

interface NativeIntegrityAnchor {
  schemaVersion: number;
  algorithm: string;
  rootSha256: string;
  production: boolean;
}

export type AssetIntegrityResult =
  | { status: 'verified'; assetCount: number }
  | { status: 'skipped'; reason: 'browser-runtime' | 'android-signed-package' | 'debug-build' }
  | { status: 'failed'; reason: string };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export function canonicalAssetPayload(assets: AssetIntegrityEntry[]): string {
  return [...assets]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((asset) => asset.path + '\0' + asset.sha256 + '\0' + asset.size + '\n')
    .join('');
}

function parseManifest(value: unknown): AssetIntegrityManifest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AssetIntegrityManifest>;
  if (
    candidate.schemaVersion !== 1
    || candidate.algorithm !== 'SHA-256'
    || !SHA256_HEX.test(candidate.rootSha256 || '')
    || !Array.isArray(candidate.assets)
    || candidate.assets.length === 0
    || candidate.assets.length > MAX_ASSET_COUNT
  ) {
    return null;
  }

  let totalBytes = 0;
  const paths = new Set<string>();
  for (const asset of candidate.assets) {
    if (
      !asset
      || typeof asset.path !== 'string'
      || asset.path.length === 0
      || asset.path.startsWith('/')
      || asset.path.includes('\\')
      || asset.path.split('/').includes('..')
      || !SHA256_HEX.test(asset.sha256)
      || !Number.isSafeInteger(asset.size)
      || asset.size < 0
      || paths.has(asset.path)
    ) {
      return null;
    }
    paths.add(asset.path);
    totalBytes += asset.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) return null;
  }

  return candidate as AssetIntegrityManifest;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('manifest-unavailable');
  return response.json();
}

export async function verifyRuntimeAssetIntegrity(): Promise<AssetIntegrityResult> {
  if (!isDesktopRuntime()) return { status: 'skipped', reason: 'browser-runtime' };
  // Android's APK signature is the package integrity boundary. Tauri's Android
  // WebView serves embedded assets through a different transport than desktop,
  // so hashing them again here creates false positives without adding security.
  if (isAndroidRuntime()) return { status: 'skipped', reason: 'android-signed-package' };

  let anchor: NativeIntegrityAnchor;
  try {
    anchor = await invoke<NativeIntegrityAnchor>('get_asset_integrity_anchor');
  } catch {
    return { status: 'failed', reason: 'native-anchor-unavailable' };
  }

  if (!anchor.production) return { status: 'skipped', reason: 'debug-build' };
  if (
    anchor.schemaVersion !== 1
    || anchor.algorithm !== 'SHA-256'
    || !SHA256_HEX.test(anchor.rootSha256)
  ) {
    return { status: 'failed', reason: 'native-anchor-invalid' };
  }

  let manifest: AssetIntegrityManifest | null;
  try {
    manifest = parseManifest(await fetchJson(MANIFEST_PATH));
  } catch {
    return { status: 'failed', reason: 'manifest-unavailable' };
  }
  if (!manifest) return { status: 'failed', reason: 'manifest-invalid' };

  const canonicalRoot = await sha256Hex(new TextEncoder().encode(canonicalAssetPayload(manifest.assets)));
  if (canonicalRoot !== manifest.rootSha256 || canonicalRoot !== anchor.rootSha256) {
    return { status: 'failed', reason: 'manifest-root-mismatch' };
  }

  try {
    for (const asset of manifest.assets) {
      const response = await fetch('./' + asset.path, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return { status: 'failed', reason: 'asset-unavailable' };
      const contents = await response.arrayBuffer();
      if (contents.byteLength !== asset.size) return { status: 'failed', reason: 'asset-size-mismatch' };
      if (await sha256Hex(contents) !== asset.sha256) {
        return { status: 'failed', reason: 'asset-hash-mismatch' };
      }
    }
  } catch {
    return { status: 'failed', reason: 'asset-verification-failed' };
  }

  return { status: 'verified', assetCount: manifest.assets.length };
}