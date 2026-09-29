#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Y-19 gate: the release workflow must not be able to publish an unsigned
 * desktop build, and the signing steps must be secret-driven.
 *
 * The `desktop:release:signing:report -- --require-signed` gate already fails a
 * job whose artifacts are unsigned, which is the fail-closed behaviour we want.
 * What it cannot catch is the *mechanical* side: a signing step that was
 * deleted, reordered before the build, or pointed at the wrong secrets would
 * still leave the gate in place, and the failure would only show up as a red
 * job on release day.
 *
 * These checks are static and run in ordinary CI, so a regression in the
 * workflow is caught long before a release is attempted.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'release-desktop.yml');
const guidePath = path.join(rootDir, 'docs', 'CODE_SIGNING_GUIDE_2026.md');

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function main() {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const guide = fs.readFileSync(guidePath, 'utf8');

  // --- 1. Every desktop job must keep the blocking signing gate. -------------
  for (const platform of ['linux', 'macos', 'windows']) {
    check(
      workflow.includes(`desktop:release:signing:report -- --platform ${platform}`),
      `release-desktop.yml: the ${platform} job must run the signing report gate`
    );
    check(
      workflow.includes(`desktop:release:gate -- --platform ${platform}`),
      `release-desktop.yml: the ${platform} job must run the desktop release gate`
    );
  }
  check(
    (workflow.match(/--require-signed/g) || []).length >= 3,
    'release-desktop.yml: every signing report invocation must pass --require-signed'
  );

  // --- 2. macOS must not be pinned to an ad-hoc identity. --------------------
  // `APPLE_SIGNING_IDENTITY: "-"` alone means every build is ad-hoc signed and
  // can never pass `spctl --assess`.
  //
  // Matched against YAML *assignments* only. An earlier version of this check
  // matched the same text inside a comment describing the old behaviour, which
  // produced a false failure; a gate that cries wolf gets ignored.
  const hardcodedAdHoc = /^\s*APPLE_SIGNING_IDENTITY:\s*["']-["']\s*$/m;
  check(
    !hardcodedAdHoc.test(workflow),
    'release-desktop.yml: APPLE_SIGNING_IDENTITY must not be hardcoded to "-" (ad-hoc signing)'
  );
  check(
    workflow.includes('APPLE_SIGNING_IDENTITY_RESOLVED'),
    'release-desktop.yml: the macOS build must use a resolved Developer ID identity when one was imported'
  );
  check(
    workflow.includes('xcrun notarytool submit'),
    'release-desktop.yml: the macOS job must submit the build for notarization'
  );
  check(
    workflow.includes('xcrun stapler staple'),
    'release-desktop.yml: the macOS job must staple the notarization ticket'
  );

  // --- 3. Windows must actually sign. ----------------------------------------
  check(
    workflow.includes('Import-PfxCertificate'),
    'release-desktop.yml: the Windows job must import the Authenticode certificate'
  );
  check(
    workflow.includes('signtool sign'),
    'release-desktop.yml: the Windows job must sign its artifacts with signtool'
  );
  check(
    /\/tr\s+\$timestamp|\/tr\s+\S+timestamp/i.test(workflow),
    'release-desktop.yml: Authenticode signatures must be timestamped so they outlive certificate expiry'
  );

  // --- 4. Signing must happen after the build, not before. -------------------
  const buildIndex = workflow.indexOf('npx tauri build');
  const windowsSignIndex = workflow.indexOf('signtool sign');
  check(
    buildIndex !== -1 && windowsSignIndex !== -1 && windowsSignIndex > buildIndex,
    'release-desktop.yml: Windows signing must run after `npx tauri build` (artifacts must exist first)'
  );

  const macBuildIndex = workflow.indexOf('npx tauri build --target universal-apple-darwin');
  const notarizeIndex = workflow.indexOf('xcrun notarytool submit');
  check(
    macBuildIndex !== -1 && notarizeIndex !== -1 && notarizeIndex > macBuildIndex,
    'release-desktop.yml: macOS notarization must run after the macOS build'
  );

  // --- 5. Signing steps must be conditional on secrets, never unconditional. --
  // An unconditional step referencing an empty secret fails confusingly; a
  // conditional one lets the gate produce the real, actionable error.
  for (const marker of [
    'Import Developer ID certificate',
    'Store notarization credentials',
    'Notarize and staple macOS build',
    'Import Authenticode certificate',
    'Sign Windows packages',
  ]) {
    const index = workflow.indexOf(marker);
    check(index !== -1, `release-desktop.yml: missing signing step "${marker}"`);
    if (index === -1) continue;
    const stepWindow = workflow.slice(index, index + 400);
    check(
      stepWindow.includes('if: ${{ env.'),
      `release-desktop.yml: "${marker}" must be conditional on its secret being present`
    );
  }

  // --- 6. The certificate must not be left lying around. ---------------------
  check(
    workflow.includes('rm -f "$CERT_PATH"') && workflow.includes('trap cleanup EXIT'),
    'release-desktop.yml: the macOS signing keychain and certificate file must be cleaned up'
  );
  check(
    workflow.includes('Remove-Item -Force $pfxPath'),
    'release-desktop.yml: the Windows .pfx must be deleted after import'
  );

  // --- 7. Every *signing* secret the workflow reads must be documented. ------
  // Scoped to signing-related secrets on purpose: the same workflow also reads
  // updater, extension and release-endpoint secrets which belong in other
  // documents, and demanding they appear here would be noise.
  const SIGNING_SECRET_PATTERN =
    /(APPLE_[A-Z0-9_]+|WINDOWS_SIGNING_[A-Z0-9_]+|ANDROID_KEYSTORE_BASE64|KALDERASHIELD_ANDROID_[A-Z0-9_]+|TAURI_SIGNING_[A-Z0-9_]+)/;
  const referenced = new Set();
  for (const match of workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
    if (SIGNING_SECRET_PATTERN.test(match[1])) referenced.add(match[1]);
  }
  for (const secret of referenced) {
    check(
      guide.includes(secret),
      `docs/CODE_SIGNING_GUIDE_2026.md: signing secret ${secret} is used by the workflow but not documented`
    );
  }
  notes.push(`signing secrets checked: ${[...referenced].sort().join(', ')}`);

  // --- 8. The gate must be the thing that blocks, not a warning. ------------
  check(
    !/continue-on-error:\s*true[\s\S]{0,200}signing:report/.test(workflow),
    'release-desktop.yml: the signing gate must not be marked continue-on-error'
  );

  // --- 9. There must be exactly one desktop release pipeline. ---------------
  //
  // Y-19 follow-up. `release-desktop-manual.yml` was a pre-Y-19 workflow left in
  // the repo: it had no `--require-signed` gate and pinned macOS to
  // `APPLE_SIGNING_IDENTITY: "-"`, i.e. ad-hoc, which is precisely what Y-19
  // removed from the real pipeline. It could not publish (`contents: read`) and
  // it was a strict subset of the tag-gated pipeline, so it had no legitimate
  // release function -- only the standing risk that someone grants it publish
  // rights later and every Y-19 guarantee silently stops applying.
  //
  // Deleting the file is not enough on its own, because nothing stopped it from
  // being re-added. Any *other* workflow that packages a desktop build is a
  // second pipeline, and it will not be covered by the checks above, which all
  // read `release-desktop.yml` only. So the duplication itself is the invariant.
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  const otherWorkflows = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') && name !== 'release-desktop.yml');
  for (const name of otherWorkflows) {
    const contents = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
    check(
      !/tauri\s+build/.test(contents),
      `${name}: must not package a desktop build; release-desktop.yml is the only release pipeline`
    );
    check(
      !/APPLE_SIGNING_IDENTITY:\s*"?-/.test(contents),
      `${name}: must not pin macOS to an ad-hoc signing identity (Y-19)`
    );
  }
  notes.push(
    otherWorkflows.length
      ? `other workflows checked for duplicate release pipelines: ${otherWorkflows.sort().join(', ')}`
      : 'no other workflows present'
  );

  for (const note of notes) console.log(`  note: ${note}`);

  if (failures.length > 0) {
    console.error('Status: FAIL — Y-19 release signing gate checks failed:');
    for (const failure of failures) console.error(`  FAIL ${failure}`);
    process.exit(1);
  }

  console.log('Status: PASS — Y-19 release signing gate checks passed.');
  console.log('  Signing steps are secret-driven, correctly ordered, and every desktop job blocks on --require-signed.');
  console.log('  Without the signing secrets configured, a public desktop release remains impossible by design.');
}

main();
