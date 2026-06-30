const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function findAndroidArtifacts(repoRoot, options = {}) {
  const buildType = options.buildType || '';
  const extensions = options.extensions || [options.extension || '.apk'];
  const outputsRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs');
  const normalizedExtensions = new Set(extensions.map((extension) => extension.toLowerCase()));

  return walk(outputsRoot)
    .filter((file) => normalizedExtensions.has(path.extname(file).toLowerCase()))
    .filter((file) => !buildType || file.split(path.sep).includes(buildType))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function findLatestAndroidApk(repoRoot, options = {}) {
  return findAndroidArtifacts(repoRoot, {
    ...options,
    extension: '.apk',
  })[0] || '';
}

function findLatestAndroidCandidateArtifacts(repoRoot, options = {}) {
  const buildType = options.buildType || 'debug';
  const artifacts = findAndroidArtifacts(repoRoot, {
    buildType,
    extensions: ['.apk', '.aab'],
  });
  const latestByExtension = new Map();

  for (const artifact of artifacts) {
    const extension = path.extname(artifact).toLowerCase();
    if (!latestByExtension.has(extension)) {
      latestByExtension.set(extension, artifact);
    }
  }

  return Array.from(latestByExtension.values())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

module.exports = {
  findAndroidArtifacts,
  findLatestAndroidApk,
  findLatestAndroidCandidateArtifacts,
};
