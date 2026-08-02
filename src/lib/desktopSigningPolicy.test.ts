import { describe, expect, it } from 'vitest';

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
    expect(isSignableArtifact({ name: 'Aegis.exe', type: 'file' }, 'windows')).toBe(true);
    expect(isSignableArtifact({ name: 'Aegis.msi', type: 'file' }, 'windows')).toBe(true);
    expect(isSignableArtifact({ name: 'Aegis.exe', type: 'directory' }, 'windows')).toBe(false);
    expect(isSignableArtifact({ name: 'Aegis.xpi', type: 'file' }, 'windows')).toBe(false);
  });

  it('requires signatures for macOS app bundles and disk images', () => {
    expect(isSignableArtifact({ name: 'Aegis Vault.app', type: 'directory' }, 'macos')).toBe(true);
    expect(isSignableArtifact({ name: 'Aegis Vault.dmg', type: 'file' }, 'macos')).toBe(true);
    expect(isSignableArtifact({ name: 'Aegis.AppImage', type: 'file' }, 'linux')).toBe(false);
  });

  it('rejects debug sidecars from publishable desktop evidence', () => {
    expect(isForbiddenDebugArtifact('AegisVault.pdb')).toBe(true);
    expect(isForbiddenDebugArtifact('Aegis.app.dSYM/Contents/Resources/DWARF/Aegis')).toBe(true);
    expect(isForbiddenDebugArtifact('assets/index.js.map')).toBe(true);
    expect(isForbiddenDebugArtifact('AegisVault.exe')).toBe(false);
  });
  it('detects debug filenames inside release archives', () => {
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...background.js.map...'))).toBe(true);
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...AegisVault.pdb...'))).toBe(true);
    expect(archiveContainsForbiddenDebugArtifact(Buffer.from('PK...background.js...'))).toBe(false);
  });
  it('reports complete signing coverage only when every required artifact is verified', () => {
    const artifacts = [
      { name: 'Aegis.exe', type: 'file' },
      { name: 'Aegis.msi', type: 'file' },
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