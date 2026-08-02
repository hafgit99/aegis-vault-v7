const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const final = args.includes('--final');
const outputArgIndex = args.indexOf('--output');
const outputPath = outputArgIndex >= 0 ? path.resolve(rootDir, args[outputArgIndex + 1]) : null;

function latestAndroidEvidence() {
  const androidRoot = path.join(rootDir, 'release-local', 'android');
  if (!fs.existsSync(androidRoot)) return null;
  const dirs = fs.readdirSync(androidRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(androidRoot, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || null;
}

function runNodeScript(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', script), ...scriptArgs], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: false,
  });
  const errorText = result.error ? String(result.error) : '';
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trimEnd(),
    stderr: [errorText, result.stderr || ''].filter(Boolean).join('\\n').trimEnd(),
  };
}

function statusFromOutput(output) {
  const match = output.match(/^Status:\s*(PASS|BLOCKED)$/m);
  return match ? match[1] : 'UNKNOWN';
}

function headingStatus(label, result) {
  return `### ${label}: ${statusFromOutput(result.stdout)}\n`;
}

function fenced(text) {
  return ['```text', text || '<no output>', '```'].join('\n');
}

const checks = [];
checks.push({
  label: 'Release reverse-engineering hardening',
  command: 'node scripts/security-release-hardening.cjs',
  result: runNodeScript('security-release-hardening.cjs', []),
});

const androidDir = latestAndroidEvidence();
if (androidDir) {
  checks.push({
    label: 'Android latest evidence',
    command: `node scripts/android-release-evidence-summary.cjs --dir ${path.relative(rootDir, androidDir).replaceAll('\\\\', '/')}${final ? ' --final' : ''}`,
    result: runNodeScript('android-release-evidence-summary.cjs', ['--dir', path.relative(rootDir, androidDir).replaceAll('\\\\', '/'), ...(final ? ['--final'] : [])]),
  });
} else {
  checks.push({
    label: 'Android latest evidence',
    command: 'node scripts/android-release-evidence-summary.cjs',
    result: { ok: false, status: 1, stdout: 'Status: BLOCKED\nBlocking issues:\n - No Android evidence directory found.', stderr: '' },
  });
}

for (const platform of ['windows', 'linux', 'macos']) {
  checks.push({
    label: `${platform} desktop evidence`,
    command: `node scripts/desktop-release-evidence-summary.cjs --platform ${platform}${final ? ' --final' : ''}`,
    result: runNodeScript('desktop-release-evidence-summary.cjs', ['--platform', platform, ...(final ? ['--final'] : [])]),
  });
}


checks.push({
  label: 'iOS / iPadOS readiness',
  command: 'node scripts/ios-readiness-check.cjs',
  result: runNodeScript('ios-readiness-check.cjs', []),
});

const passed = checks.every((check) => check.result.ok && statusFromOutput(check.result.stdout) === 'PASS');
const lines = [];
lines.push('# Aegis Vault 7 Release Readiness Summary');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Mode: ${final ? 'final distribution' : 'standard evidence'}`);
lines.push(`Overall status: ${passed ? 'PASS' : 'BLOCKED'}`);
lines.push('');
lines.push('This report aggregates local release evidence summaries. A BLOCKED result means the artifact should stay internal until the listed evidence gaps are resolved. It does not automatically change artifact files.');
lines.push('');
for (const check of checks) {
  lines.push(headingStatus(check.label, check.result));
  lines.push(`Command: \`${check.command}\``);
  lines.push('');
  lines.push(fenced([check.result.stdout, check.result.stderr].filter(Boolean).join('\n')));
  lines.push('');
}

const report = lines.join('\n');
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, report + '\n');
  console.log(`Release readiness summary written to ${path.relative(rootDir, outputPath)}`);
} else {
  console.log(report);
}

if (strict && !passed) process.exit(1);
