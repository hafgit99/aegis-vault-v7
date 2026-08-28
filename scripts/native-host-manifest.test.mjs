import { describe, expect, it } from 'vitest';
import {
  buildAllowedOrigins,
  buildChromeHostManifest,
  buildFirefoxHostManifest,
  chromeOriginFromId,
  collectValidatedOriginsFromObjects,
  normalizeChromeExtensionId,
  PRIMARY_CHROME_EXTENSION_ID,
} from './native-host-manifest.mjs';

const VALID_ID_A = 'bfjfdbphbmdfinjddbbegnlclanbpnch';
const VALID_ID_B = 'cojgpfjcljepclmjldmdcfbghidmfgph';

describe('normalizeChromeExtensionId', () => {
  it('accepts a bare 32-char [a-p] ID and lowercases it', () => {
    expect(normalizeChromeExtensionId('BFJFDBPHBMDFINJDDBBEGNLCLANBPNCH')).toBe(VALID_ID_A);
  });

  it('accepts a full chrome-extension origin', () => {
    expect(normalizeChromeExtensionId(`chrome-extension://${VALID_ID_B}/`)).toBe(VALID_ID_B);
  });

  it('trims surrounding whitespace and trailing slashes', () => {
    expect(normalizeChromeExtensionId(`  ${VALID_ID_A}/  `)).toBe(VALID_ID_A);
  });

  it('rejects IDs outside the [a-p] alphabet', () => {
    expect(normalizeChromeExtensionId('zrjfdbphbmdfinjddbbegnlclanbpnch')).toBeNull();
  });

  it('rejects wrong lengths and non-string input', () => {
    expect(normalizeChromeExtensionId('short-id')).toBeNull();
    expect(normalizeChromeExtensionId(undefined)).toBeNull();
    expect(normalizeChromeExtensionId(42)).toBeNull();
  });
});

describe('buildAllowedOrigins', () => {
  it('formats valid IDs as chrome-extension origins and dedupes', () => {
    expect(buildAllowedOrigins([VALID_ID_A, `chrome-extension://${VALID_ID_B}/`, VALID_ID_A])).toEqual([
      `chrome-extension://${VALID_ID_A}/`,
      `chrome-extension://${VALID_ID_B}/`,
    ]);
  });

  it('throws on invalid IDs instead of silently widening the origin list', () => {
    expect(() => buildAllowedOrigins([VALID_ID_A, 'not-a-real-id'])).toThrow(/Invalid Chrome extension ID/);
  });

  it('starts from the primary signed extension ID in real usage', () => {
    expect(buildAllowedOrigins([PRIMARY_CHROME_EXTENSION_ID])).toEqual([
      `chrome-extension://${PRIMARY_CHROME_EXTENSION_ID}/`,
    ]);
  });
});

describe('manifest builders', () => {
  it('builds a Chromium manifest restricted to validated origins only', () => {
    const manifest = buildChromeHostManifest({
      hostPath: 'C:\\install\\aegis.exe',
      extensionIds: [PRIMARY_CHROME_EXTENSION_ID],
    });
    expect(manifest).toEqual({
      name: 'com.hafgit99.aegisvault7',
      description: 'Aegis Vault Native Messaging Host',
      path: 'C:\\install\\aegis.exe',
      type: 'stdio',
      allowed_origins: [`chrome-extension://${PRIMARY_CHROME_EXTENSION_ID}/`],
    });
    expect(JSON.stringify(manifest)).not.toContain('wildcard');
  });

  it('builds a Firefox manifest pinned to the signed Gecko ID', () => {
    const manifest = buildFirefoxHostManifest({ hostPath: '/usr/bin/aegis' });
    expect(manifest.allowed_extensions).toEqual(['aegisvault7@hafgit99.com']);
    expect(manifest.allowed_origins).toBeUndefined();
  });
});

describe('collectValidatedOriginsFromObjects', () => {
  it('migrates valid origins from previously generated manifests', () => {
    const legacy = [
      {
        allowed_origins: [
          `chrome-extension://${VALID_ID_A}/`,
          `chrome-extension://${VALID_ID_B}/`,
        ],
      },
      { allowed_origins: [`chrome-extension://${VALID_ID_B}/`] },
    ];
    expect(collectValidatedOriginsFromObjects(legacy)).toEqual([
      `chrome-extension://${VALID_ID_A}/`,
      `chrome-extension://${VALID_ID_B}/`,
    ]);
  });

  it('ignores malformed origins, non-arrays, and null manifests', () => {
    expect(
      collectValidatedOriginsFromObjects([
        null,
        { allowed_origins: ['https://evil.example/', 123, `chrome-extension://${VALID_ID_A}/`] },
        {},
      ]),
    ).toEqual([`chrome-extension://${VALID_ID_A}/`]);
  });
});

describe('chromeOriginFromId', () => {
  it('returns null for invalid IDs', () => {
    expect(chromeOriginFromId('!!')).toBeNull();
  });
});