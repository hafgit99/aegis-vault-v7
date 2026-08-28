/**
 * @file Pure helpers for native messaging host manifest generation (EXT-B2).
 *
 * Native host manifests embed a machine-specific absolute executable path, so
 * they are generated at registration/install time and must never be committed
 * to the repository or shipped inside extension build outputs. Keeping the
 * pure logic here allows unit testing without touching the filesystem.
 */

export const HOST_NAME = 'com.hafgit99.aegisvault7';
export const HOST_DESCRIPTION = 'Aegis Vault Native Messaging Host';
export const FIREFOX_EXTENSION_ID = 'aegisvault7@hafgit99.com';

/** Primary signed Chrome Web Store extension ID. */
export const PRIMARY_CHROME_EXTENSION_ID = 'bfjfdbphbmdfinjddbbegnlclanbpnch';

const CHROME_ID_PATTERN = /^[a-p]{32}$/;

/**
 * Normalizes a raw Chrome extension ID (accepts bare IDs, full origins, and
 * surrounding whitespace). Returns the lowercase ID or `null` when invalid.
 */
export function normalizeChromeExtensionId(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .replace(/^chrome-extension:\/\//i, '')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();
  return CHROME_ID_PATTERN.test(cleaned) ? cleaned.toLowerCase() : null;
}

/** Converts a validated Chrome extension ID into its allowed origin form. */
export function chromeOriginFromId(id) {
  const normalized = normalizeChromeExtensionId(id);
  return normalized ? `chrome-extension://${normalized}/` : null;
}

/**
 * Builds the validated `allowed_origins` list for the Chromium host manifest.
 * Chrome/Edge do NOT support wildcards (`*`) in `allowed_origins`, so only
 * explicitly configured, format-valid signed extension IDs are permitted;
 * invalid entries are rejected instead of being silently forwarded.
 */
export function buildAllowedOrigins(extensionIds) {
  const origins = [];
  for (const raw of extensionIds) {
    const origin = chromeOriginFromId(raw);
    if (!origin) {
      throw new Error(
        `Invalid Chrome extension ID '${String(raw)}': expected a 32-character [a-p] ID.`,
      );
    }
    if (!origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

/** Builds the Chromium (Chrome/Edge) native messaging host manifest object. */
export function buildChromeHostManifest({ hostPath, extensionIds }) {
  return {
    name: HOST_NAME,
    description: HOST_DESCRIPTION,
    path: hostPath,
    type: 'stdio',
    allowed_origins: buildAllowedOrigins(extensionIds),
  };
}

/** Builds the Firefox native messaging host manifest object. */
export function buildFirefoxHostManifest({ hostPath, firefoxExtensionId = FIREFOX_EXTENSION_ID }) {
  return {
    name: HOST_NAME,
    description: HOST_DESCRIPTION,
    path: hostPath,
    type: 'stdio',
    allowed_extensions: [firefoxExtensionId],
  };
}

/**
 * Extracts format-valid `allowed_origins` from previously generated manifest
 * objects so an existing local registration can be migrated forward without
 * re-entering extension IDs. Invalid or foreign entries are ignored.
 */
export function collectValidatedOriginsFromObjects(manifestObjects) {
  const origins = [];
  for (const manifest of manifestObjects) {
    if (!manifest || !Array.isArray(manifest.allowed_origins)) continue;
    for (const rawOrigin of manifest.allowed_origins) {
      if (typeof rawOrigin !== 'string') continue;
      const origin = chromeOriginFromId(rawOrigin);
      if (origin && !origins.includes(origin)) {
        origins.push(origin);
      }
    }
  }
  return origins;
}