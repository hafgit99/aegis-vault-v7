/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Building Safari WebExtension bundle...');

try {
  execSync('npm run build:extension', { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to compile browser extension bundle:', err);
  process.exit(1);
}

const safariDir = path.resolve('dist-extension-safari');
if (!fs.existsSync(safariDir)) {
  console.error('Error: dist-extension-safari directory was not created.');
  process.exit(1);
}

const manifestPath = path.join(safariDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: Safari manifest.json missing.');
  process.exit(1);
}

console.log('\n[PASS] Safari WebExtension artifact created at dist-extension-safari/');
console.log('To generate Xcode Safari App Extension project on macOS, run:');
console.log('  xcrun safari-web-extension-converter dist-extension-safari --project-name "AegisVaultSafari"\n');
