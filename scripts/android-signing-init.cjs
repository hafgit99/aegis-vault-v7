const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const examplePath = path.join(repoRoot, 'docs', 'android-signing.env.example');
const secretsDir = path.join(repoRoot, '.secrets');
const targetPath = path.join(secretsDir, 'android-signing.env');

function relative(file) {
  return path.relative(repoRoot, file) || '.';
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing template: ' + relative(examplePath));
  process.exit(1);
}

fs.mkdirSync(secretsDir, { recursive: true });

if (fs.existsSync(targetPath)) {
  console.log('Android signing env already exists: ' + relative(targetPath));
  console.log('No changes made. Edit it locally or delete it before reinitializing.');
  process.exit(0);
}

fs.copyFileSync(examplePath, targetPath);
console.log('Created local Android signing env: ' + relative(targetPath));
console.log('Fill the four AEGIS_ANDROID_* values, then run: npm run android:release:signing:check');
