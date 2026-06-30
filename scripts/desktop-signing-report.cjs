const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const releaseLocalDir = path.join(rootDir, 'release-local');
const args = process.argv.slice(2);

const platform = getArgValue('--platform') || detectPlatform();
const explicitDir = getArgValue('--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const requireSigned = hasFlag('--require-signed');

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function usage() {
  return [
    'Desktop signing report',
    '',
    'Usage:',
    '  npm run desktop:release:signing:report -- [options]',
    '',
    'Options:',
    '  --platform <windows|linux|macos>  Evidence platform. Defaults to host platform.',
    '  --dir <path>                       Evidence directory. Defaults to release-local/<platform>.',
    '  --require-signed                  Fail if signable artifacts are not verified as signed.',
    '  --help                            Show this help.',
  ].join('\n');
}

function fail(message) {
  throw new Error(message);
}

function assertPlatform(value) {
  if (!['windows', 'linux', 'macos'].includes(value)) {
    fail('Unsupported desktop release platform: ' + value);
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('Failed to read JSON file ' + file + ': ' + (error && error.message ? error.message : String(error)));
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status === 0 ? 'ok' : 'failed',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    exitCode: result.status,
    error: result.error ? result.error.message : null,
  };
}

function resolveArtifactPath(artifact) {
  const fullPath = path.resolve(rootDir, artifact.path);
  const relativeToEvidence = path.relative(evidenceDir, fullPath);
  if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) {
    fail('Artifact path escapes evidence directory: ' + artifact.path);
  }
  return fullPath;
}

function isWindowsSignable(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.exe') || lower.endsWith('.msi');
}

function isMacosSignable(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.app') || lower.endsWith('.dmg');
}

function inspectWindowsSignature(file) {
  if (process.platform !== 'win32') {
    return { verified: false, applicable: true, status: 'not-checked', detail: 'Windows Authenticode can only be checked on Windows.' };
  }
  const ps = [
    '$sig = Get-AuthenticodeSignature -LiteralPath ' + JSON.stringify(file) + ';',
    '$cert = $sig.SignerCertificate;',
    '[pscustomobject]@{ Status = [string]$sig.Status; Subject = if ($cert) { $cert.Subject } else { $null }; Thumbprint = if ($cert) { $cert.Thumbprint } else { $null } } | ConvertTo-Json -Compress',
  ].join(' ');
  const result = run('powershell.exe', ['-NoProfile', '-Command', ps]);
  if (result.status !== 'ok') {
    return { verified: false, applicable: true, status: 'tool-failed', detail: result.stderr || result.error || 'Get-AuthenticodeSignature failed' };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      verified: parsed.Status === 'Valid',
      applicable: true,
      status: parsed.Status || 'unknown',
      subject: parsed.Subject || null,
      thumbprint: parsed.Thumbprint || null,
      detail: parsed.Status === 'Valid' ? 'Authenticode signature is valid.' : 'Authenticode signature status is ' + (parsed.Status || 'unknown') + '.',
    };
  } catch {
    return { verified: false, applicable: true, status: 'parse-failed', detail: result.stdout || 'Unable to parse Authenticode output.' };
  }
}

function inspectMacosSignature(file, artifact) {
  if (process.platform !== 'darwin') {
    return { verified: false, applicable: true, status: 'not-checked', detail: 'codesign/spctl can only be checked on macOS.' };
  }
  const lower = artifact.name.toLowerCase();
  const codesign = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', file]);
  const spctl = lower.endsWith('.dmg')
    ? run('spctl', ['--assess', '--type', 'open', '--verbose=2', file])
    : run('spctl', ['--assess', '--type', 'execute', '--verbose=2', file]);
  return {
    verified: codesign.status === 'ok' && spctl.status === 'ok',
    applicable: true,
    status: codesign.status === 'ok' && spctl.status === 'ok' ? 'valid' : 'not-valid',
    detail: 'codesign: ' + (codesign.stderr || codesign.stdout || codesign.status) + '; spctl: ' + (spctl.stderr || spctl.stdout || spctl.status),
  };
}

function inspectLinuxSignature(artifact) {
  const lower = artifact.name.toLowerCase();
  if (lower.endsWith('.deb')) {
    return { verified: false, applicable: false, status: 'manual', detail: 'Debian package repository signing is outside this local artifact check. Publish repository signatures separately.' };
  }
  if (lower.endsWith('.appimage')) {
    return { verified: false, applicable: false, status: 'manual', detail: 'AppImage signing is not required by the current local gate. Publish SHA-256 checksums and optional detached signatures.' };
  }
  return { verified: false, applicable: false, status: 'not-applicable', detail: 'No platform signing check applies to this artifact.' };
}

function inspectArtifact(artifact) {
  if (artifact.type !== 'file' && artifact.type !== 'directory') {
    return { verified: false, applicable: false, status: 'unsupported', detail: 'Unsupported artifact type.' };
  }
  const artifactPath = resolveArtifactPath(artifact);
  if (platform === 'windows' && artifact.type === 'file' && isWindowsSignable(artifact.name)) {
    return inspectWindowsSignature(artifactPath);
  }
  if (platform === 'macos' && isMacosSignable(artifact.name)) {
    return inspectMacosSignature(artifactPath, artifact);
  }
  if (platform === 'linux') {
    return inspectLinuxSignature(artifact);
  }
  return { verified: false, applicable: false, status: 'not-applicable', detail: 'No platform signing check applies to this artifact.' };
}

function writeReport(metadata, results) {
  const lines = [
    '# Aegis Vault 7 Desktop Signing Report',
    '',
    'Version: ' + metadata.version,
    'Platform: ' + metadata.platform,
    'Commit: ' + metadata.commit,
    'Require signed artifacts: ' + (requireSigned ? 'yes' : 'no'),
    '',
    '## Results',
    '',
  ];

  for (const result of results) {
    lines.push('- `' + result.name + '` - ' + result.status + (result.verified ? ' (verified)' : ''));
    lines.push('  - Applicable: ' + (result.applicable ? 'yes' : 'no'));
    if (result.subject) lines.push('  - Subject: ' + result.subject);
    if (result.thumbprint) lines.push('  - Thumbprint: ' + result.thumbprint);
    lines.push('  - Detail: ' + result.detail);
  }

  lines.push('', '## Policy', '', '- Public Windows/macOS releases must be signed and verified before publishing.', '- Internal diagnostic builds may be unsigned when release notes clearly state that signing was not verified.', '');
  fs.writeFileSync(path.join(evidenceDir, 'DESKTOP_SIGNATURES.md'), lines.join('\n'), 'utf8');
}

function generateSigningReport() {
  assertPlatform(platform);
  const metadataPath = path.join(evidenceDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    fail('metadata.json not found. Run release evidence collection before signing report: ' + metadataPath);
  }
  const metadata = readJson(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  const results = artifacts.map((artifact) => ({ name: artifact.name, ...inspectArtifact(artifact) }));
  writeReport(metadata, results);

  const failedRequired = results.filter((result) => result.applicable && !result.verified);
  if (requireSigned && failedRequired.length > 0) {
    fail('Required signing verification failed for: ' + failedRequired.map((result) => result.name).join(', '));
  }
  console.log('Desktop signing report written to ' + path.relative(rootDir, path.join(evidenceDir, 'DESKTOP_SIGNATURES.md')));
  console.log('Signable artifacts verified: ' + results.filter((result) => result.verified).length + '/' + results.filter((result) => result.applicable).length);
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

generateSigningReport();
