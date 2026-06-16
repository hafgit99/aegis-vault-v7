const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const jniLibsDir = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'jniLibs');
const expectedRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android');

const resolvedJniLibsDir = path.resolve(jniLibsDir);
const resolvedExpectedRoot = path.resolve(expectedRoot);

if (!resolvedJniLibsDir.startsWith(resolvedExpectedRoot + path.sep)) {
  throw new Error(`Refusing to remove unexpected path: ${resolvedJniLibsDir}`);
}

fs.rmSync(resolvedJniLibsDir, { recursive: true, force: true });
console.log(`Removed Android native library intermediates: ${path.relative(repoRoot, resolvedJniLibsDir)}`);
