/**
 * @file scripts/generate-npm-sbom.cjs
 * @description Generates a CycloneDX 1.6 SBOM for the npm dependency tree
 * (package-lock.json based, no node_modules required).
 *
 * The package.json version follows a 4-part Android versionCode scheme
 * (e.g. 7.0.3.0) which is not valid SemVer. CycloneDX tooling rejects it,
 * so a normalized copy of the manifest + lockfile (3-part version) is
 * created in a temp directory and used as the SBOM source.
 *
 * Output: release-local/sbom/npm-sbom.json
 *
 * @license Apache-2.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'release-local', 'sbom');
const outputFile = path.join(outputDir, 'npm-sbom.json');

function normalizeVersion(version) {
  const parts = version.split('.');
  return parts.length > 3 ? parts.slice(0, 3).join('.') : version;
}

function main() {
  const pkg = require(path.join(rootDir, 'package.json'));
  const lock = require(path.join(rootDir, 'package-lock.json'));
  const version = normalizeVersion(pkg.version);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-sbom-'));
  try {
    const normalizedPkg = { ...pkg, version };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(normalizedPkg, null, 2),
      'utf8'
    );

    const normalizedLock = JSON.parse(JSON.stringify(lock));
    normalizedLock.version = version;
    if (normalizedLock.packages && normalizedLock.packages['']) {
      normalizedLock.packages[''].version = version;
    }
    fs.writeFileSync(
      path.join(tmpDir, 'package-lock.json'),
      JSON.stringify(normalizedLock, null, 2),
      'utf8'
    );

    fs.mkdirSync(outputDir, { recursive: true });

    // NB: the package "exports" map does not expose its package.json, so the CLI
    // entry is resolved via the standard node_modules layout.
    const cyclonedxCli = path.join(
      rootDir,
      'node_modules',
      '@cyclonedx',
      'cyclonedx-npm',
      'bin',
      'cyclonedx-npm-cli.js'
    );
    if (!fs.existsSync(cyclonedxCli)) {
      throw new Error(
        '@cyclonedx/cyclonedx-npm is not installed. Run: npm install (it is a devDependency).'
      );
    }

    const manifestPath = path.join(tmpDir, 'package.json');
    console.log(`\n📦 Generating npm SBOM (CycloneDX 1.6) for ${pkg.name}@${version}...`);

    const result = spawnSync(
      process.execPath,
      [
        cyclonedxCli,
        '--package-lock-only',
        '--ignore-npm-errors',
        '--spec-version',
        '1.6',
        '--output-format',
        'JSON',
        '--output-file',
        outputFile,
        manifestPath,
      ],
      { cwd: rootDir, stdio: 'inherit' }
    );
    if (result.status !== 0) {
      throw new Error(`cyclonedx-npm failed with exit code ${result.status}`);
    }

    const bom = require(outputFile);
    const components = (bom.components || []).length;
    console.log(`✓ npm SBOM written to ${path.relative(rootDir, outputFile)}`);
    console.log(`  Components: ${components}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
