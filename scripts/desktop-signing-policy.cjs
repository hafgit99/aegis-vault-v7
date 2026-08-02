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
function archiveContainsForbiddenDebugArtifact(buffer) {
  const contents = Buffer.isBuffer(buffer) ? buffer.toString('latin1').toLowerCase() : '';
  return contents.includes('.pdb')
    || contents.includes('.js.map')
    || contents.includes('.css.map')
    || contents.includes('.dsym/');
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