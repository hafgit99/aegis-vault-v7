import { invoke } from '@tauri-apps/api/core';

import { isAndroidRuntime, isDesktopRuntime } from './desktopStorage';

const MANIFEST_PATH = './aegis-integrity.json';
// Y-20: the document that decides what runs. Required in the manifest.
const INDEX_HTML_PATH = 'index.html';
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

// Schemes that are not covered by the asset manifest, and must not be treated
// as if they were. `data:`/`blob:` are produced in-memory by the app itself,
// and an absolute `http(s):` URL is a different origin, not a bundled file.
const NON_LOCAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Y-20: the counter-check. `verifyRuntimeAssetIntegrity` used to walk
 * `manifest.assets` and nothing else, so it could only ever confirm that the
 * files it already knew about were intact. It never asked the question that
 * actually matters: *does the document reference anything the manifest does not
 * vouch for?*
 *
 * With `index.html` outside the manifest that question had teeth, because
 * `index.html` is the document that loads every other script. A local write
 * adding `<script src="evil.js">` produced a `verified` result while running
 * attacker JS against a decrypted vault. `index.html` is now in the manifest,
 * so its own hash catches that, and this catches the rest: a reference that
 * cannot be traced back to a hashed, verified asset fails closed.
 *
 * Kept pure and separate from the DOM so it can be tested without one.
 */
export function findUnlistedAssetReferences(
  manifestPaths: Iterable<string>,
  references: Iterable<string>,
): string[] {
  const listed = new Set(manifestPaths);
  const unlisted = new Set<string>();
  for (const raw of references) {
    const reference = raw.trim();
    if (reference === '' || NON_LOCAL_URL.test(reference)) continue;
    // Manifest paths are relative and normalised ("assets/index-abc.js"); document
    // references are site-absolute ("/assets/index-abc.js"). Anything that tries to
    // walk out of dist is *not* something to normalise away — a reference the
    // manifest cannot name is exactly what we are looking for.
    // A reference the manifest cannot name is exactly what we are looking for,
    // so a traversal attempt is left as-is rather than resolved.
    const normalized = reference.startsWith('/') ? reference.slice(1) : reference;
    if (!listed.has(normalized)) unlisted.add(reference);
  }
  return [...unlisted].sort();
}

/**
 * Collects the bundled-asset URLs a document actually asks the app to load.
 *
 * Takes HTML rather than reading the live `document`, because
 * `document.documentElement.outerHTML` is a re-serialisation of the parsed DOM
 * and would never hash to the original bytes.
 */
export function collectDocumentAssetReferences(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const references: string[] = [];
  for (const element of parsed.querySelectorAll('script[src], link[href], img[src]')) {
    const url = element.getAttribute('src') ?? element.getAttribute('href');
    if (url) references.push(url);
  }
  return references;
}

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

  // Y-20: index.html must be in the manifest. If it is not, the document that
  // decides what runs is unverified, and every other hash in here is about
  // files that document merely references.
  if (!manifest.assets.some((asset) => asset.path === INDEX_HTML_PATH)) {
    return { status: 'failed', reason: 'index-html-unlisted' };
  }

  const canonicalRoot = await sha256Hex(new TextEncoder().encode(canonicalAssetPayload(manifest.assets)));
  if (canonicalRoot !== manifest.rootSha256 || canonicalRoot !== anchor.rootSha256) {
    return { status: 'failed', reason: 'manifest-root-mismatch' };
  }

  const manifestPaths = manifest.assets.map((asset) => asset.path);
  let verifiedHtml: string | null = null;

  try {
    for (const asset of manifest.assets) {
      const response = await fetch('./' + asset.path, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return { status: 'failed', reason: 'asset-unavailable' };
      const contents = await response.arrayBuffer();
      if (contents.byteLength !== asset.size) return { status: 'failed', reason: 'asset-size-mismatch' };
      if (await sha256Hex(contents) !== asset.sha256) {
        return { status: 'failed', reason: 'asset-hash-mismatch' };
      }
      // Y-20: keep the exact bytes we just hashed, so the counter-check below
      // reasons about the same document rather than re-fetching a second copy.
      if (asset.path === INDEX_HTML_PATH) {
        verifiedHtml = new TextDecoder().decode(contents);
      }
    }
  } catch {
    return { status: 'failed', reason: 'asset-verification-failed' };
  }

  if (verifiedHtml === null) return { status: 'failed', reason: 'index-html-unverified' };

  // The counter-check, run against the bytes that were just verified.
  const unlisted = findUnlistedAssetReferences(
    manifestPaths,
    collectDocumentAssetReferences(verifiedHtml),
  );
  if (unlisted.length > 0) {
    return { status: 'failed', reason: 'unlisted-asset-reference' };
  }

  return { status: 'verified', assetCount: manifest.assets.length };
}