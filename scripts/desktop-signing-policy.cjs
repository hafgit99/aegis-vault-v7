function isSignableArtifact(artifact, platform) {
  if (!artifact || !['file', 'directory'].includes(artifact.type)) return false;
  const name = String(artifact.name || '').toLowerCase();
  if (platform === 'windows') {
    return artifact.type === 'file' && (name.endsWith('.exe') || name.endsWith('.msi'));
  }
  if (platform === 'macos') {
    return name.endsWith('.app') || name.endsWith('.dmg');
  }
  return false;
}

function isForbiddenDebugArtifact(artifactPath) {
  const normalized = String(artifactPath || '').replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.pdb')
    || normalized.endsWith('.map')
    || normalized.includes('.dsym/');
}
let AdmZip;
try {
  AdmZip = require('adm-zip');
} catch (_) {}

function archiveContainsForbiddenDebugArtifact(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (AdmZip) {
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      for (const entry of entries) {
        const name = (entry.entryName || '').toLowerCase();
        if (name.endsWith('.js.map') || name.endsWith('.css.map') || name.endsWith('.pdb') || name.includes('.dsym/')) {
          return true;
        }
      }
      return false;
    } catch (_) {}
  }
  const str = buffer.toString('binary');
  return /\b[a-zA-Z0-9_\-\/\.]+\.(?:js\.map|css\.map|pdb)\b/i.test(str)
    || /\b[a-zA-Z0-9_\-\/\.]+\.dsym\//i.test(str);
}
function signingCoverage(artifacts, platform, reportContents) {
  const required = artifacts.filter((artifact) => isSignableArtifact(artifact, platform)).length;
  const applicable = (String(reportContents || '').match(/Applicable: yes/g) || []).length;
  const verified = (String(reportContents || '').match(/\(verified\)/g) || []).length;
  return {
    required,
    applicable,
    verified,
    complete: required === 0 || (applicable >= required && verified >= required),
  };
}

module.exports = {
  isSignableArtifact,
  isForbiddenDebugArtifact,
  archiveContainsForbiddenDebugArtifact,
  signingCoverage,
};