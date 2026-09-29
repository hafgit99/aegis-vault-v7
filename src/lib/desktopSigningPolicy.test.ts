import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const { archiveContainsForbiddenDebugArtifact, isForbiddenDebugArtifact, isSignableArtifact, signingCoverage } = require('../../scripts/desktop-signing-policy.cjs') as {
  archiveContainsForbiddenDebugArtifact: (buffer: Buffer) => boolean;
  isForbiddenDebugArtifact: (artifactPath: string) => boolean;
  isSignableArtifact: (artifact: { name: string; type: string }, platform: string) => boolean;
  signingCoverage: (
    artifacts: Array<{ name: string; type: string }>,
    platform: string,
    reportContents: string,
  ) => { required: number; applicable: number; verified: number; complete: boolean };
};

describe('desktop signing policy', () => {
  it('requires signatures for Windows installers and executables only', () => {
    expect(isSignableArtifact({ name: 'KalderaShield.exe', type: 'file' }, 'windows')).toBe(true);
    expect(isSignableArtifact({ name: 'KalderaShield.msi', type: 'file' }, 'windows')).toBe(true);
    expect(isSignableArtifact({ name: 'KalderaShield.exe', type: 'directory' }, 'windows')).toBe(false);
    expect(isSignableArtifact({ name: 'KalderaShield.xpi', type: 'file' }, 'windows')).toBe(false);
  });

  it('requires signatures for macOS app bundles and disk images', () => {
    expect(isSignableArtifact({ name: 'KalderaShield.app', type: 'directory' }, 'macos')).toBe(true);
    expect(isSignableArtifact({ name: 'KalderaShield.dmg', type: 'file' }, 'macos')).toBe(true);
    expect(isSignableArtifact({ name: 'KalderaShield.AppImage', type: 'file' }, 'linux')).toBe(false);
  });

  it('rejects debug sidecars from publishable desktop evidence', () => {
    expect(isForbiddenDebugArtifact('KalderaShield.pdb')).toBe(true);
    expect(isForbiddenDebugArtifact('KalderaShield.app.dSYM/Contents/Resources/DWARF/KalderaShield')).toBe(true);
    expect(isForbiddenDebugArtifact('assets/index.js.map')).toBe(true);
    expect(isForbiddenDebugArtifact('KalderaShield.exe')).toBe(false);
  });
  it('detects debug filenames inside release archives', () => {
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...background.js.map...'))).toBe(true);
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...KalderaShield.pdb...'))).toBe(true);
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...background.js...'))).toBe(false);
  });
  it('reports complete signing coverage only when every required artifact is verified', () => {
    const artifacts = [
      { name: 'KalderaShield.exe', type: 'file' },
      { name: 'KalderaShield.msi', type: 'file' },
      { name: 'SHA256SUMS.txt', type: 'file' },
    ];
    const complete = signingCoverage(
      artifacts,
      'windows',
      'Applicable: yes (verified)\nApplicable: yes (verified)',
    );
    expect(complete).toEqual({ required: 2, applicable: 2, verified: 2, complete: true });

    const incomplete = signingCoverage(artifacts, 'windows', 'Applicable: yes (verified)');
    expect(incomplete).toEqual({ required: 2, applicable: 1, verified: 1, complete: false });
  });
});