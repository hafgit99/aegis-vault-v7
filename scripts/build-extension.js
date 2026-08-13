import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('dist-extension');
const outDirFirefox = path.resolve('dist-extension-firefox');
const srcDir = path.resolve('src-extension');
const isDebugBuild = process.argv.includes('--debug');

const batPath = path.join(outDir, 'aegis-host.bat');
const manifestPath = path.join(outDir, 'com.hafgit99.aegisvault7.json');
const firefoxBatPath = path.join(outDirFirefox, 'aegis-host.bat');
const firefoxHostManifestPath = path.join(outDirFirefox, 'com.hafgit99.aegisvault7.json');

// Backup host registry files if they exist
const batBackup = fs.existsSync(batPath) ? fs.readFileSync(batPath) : null;
const jsonBackup = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : null;
const firefoxBatBackup = fs.existsSync(firefoxBatPath) ? fs.readFileSync(firefoxBatPath) : null;
const firefoxJsonBackup = fs.existsSync(firefoxHostManifestPath) ? fs.readFileSync(firefoxHostManifestPath) : null;

// Ensure outDir exists
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Restore backup
if (batBackup) fs.writeFileSync(batPath, batBackup);
if (jsonBackup) fs.writeFileSync(manifestPath, jsonBackup);

// Ensure source icons directory exists and copy icons from Tauri
const srcIconsDir = path.join(srcDir, 'icons');
if (!fs.existsSync(srcIconsDir)) {
  fs.mkdirSync(srcIconsDir, { recursive: true });
}

// Copy Tauri icons to extension source icons if missing
const tauriIconsSrc = path.resolve('src-tauri/icons');
if (fs.existsSync(tauriIconsSrc)) {
  const mapping = {
    '32x32.png': 'icon16.png',
    '64x64.png': 'icon48.png',
    '128x128.png': 'icon128.png'
  };
  
  for (const [srcName, destName] of Object.entries(mapping)) {
    const srcPath = path.join(tauriIconsSrc, srcName);
    const destPath = path.join(srcIconsDir, destName);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  console.log('Compiling extension TS files using esbuild (' + (isDebugBuild ? 'debug' : 'release') + ')...');
  await esbuild.build({
    entryPoints: [
      path.join(srcDir, 'background.ts'),
      path.join(srcDir, 'content.ts'),
      path.join(srcDir, 'popup.ts')
    ],
    bundle: true,
    outdir: outDir,
    platform: 'browser',
    target: ['chrome105', 'firefox100', 'safari15'],
    minify: !isDebugBuild,
    sourcemap: isDebugBuild,
    legalComments: 'none',
  });

  // Sync tokens.css from src/styles/tokens.css to src-extension and outDir
  const sourceTokensPath = path.resolve('src/styles/tokens.css');
  if (fs.existsSync(sourceTokensPath)) {
    fs.copyFileSync(sourceTokensPath, path.join(srcDir, 'tokens.css'));
    fs.copyFileSync(sourceTokensPath, path.join(outDir, 'tokens.css'));
  } else if (fs.existsSync(path.join(srcDir, 'tokens.css'))) {
    fs.copyFileSync(path.join(srcDir, 'tokens.css'), path.join(outDir, 'tokens.css'));
  }

  // Copy HTML, CSS, Manifest
  fs.copyFileSync(path.join(srcDir, 'popup.html'), path.join(outDir, 'popup.html'));
  fs.copyFileSync(path.join(srcDir, 'styles.css'), path.join(outDir, 'styles.css'));
  fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(outDir, 'manifest.json'));

  // Copy icons folder to dist
  const distIconsDir = path.join(outDir, 'icons');
  if (!fs.existsSync(distIconsDir)) {
    fs.mkdirSync(distIconsDir, { recursive: true });
  }

  if (fs.existsSync(srcIconsDir)) {
    const files = fs.readdirSync(srcIconsDir);
    for (const file of files) {
      fs.copyFileSync(path.join(srcIconsDir, file), path.join(distIconsDir, file));
    }
  }

  console.log('Extension build completed successfully inside dist-extension/ !');

  // Generate Firefox-specific build
  if (fs.existsSync(outDirFirefox)) {
    fs.rmSync(outDirFirefox, { recursive: true, force: true });
  }
  fs.mkdirSync(outDirFirefox, { recursive: true });

  const copyFolderRecursive = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      const srcFile = path.join(src, file);
      const destFile = path.join(dest, file);
      if (fs.lstatSync(srcFile).isDirectory()) {
        copyFolderRecursive(srcFile, destFile);
      } else {
        fs.copyFileSync(srcFile, destFile);
      }
    });
  };
  copyFolderRecursive(outDir, outDirFirefox);

  const firefoxManifestPath = path.join(outDirFirefox, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
  
  if (manifest.background && manifest.background.service_worker) {
    const bgJs = manifest.background.service_worker;
    delete manifest.background.service_worker;
    manifest.background.scripts = [bgJs];
    delete manifest.background.type;
  }
  
  fs.writeFileSync(firefoxManifestPath, JSON.stringify(manifest, null, 2));

  if (firefoxBatBackup) fs.writeFileSync(firefoxBatPath, firefoxBatBackup);
  if (firefoxJsonBackup) fs.writeFileSync(firefoxHostManifestPath, firefoxJsonBackup);

  console.log('Firefox-optimized extension build completed inside dist-extension-firefox/ !');

  // Generate Safari-specific WebExtension build
  const outDirSafari = path.resolve('dist-extension-safari');
  if (fs.existsSync(outDirSafari)) {
    fs.rmSync(outDirSafari, { recursive: true, force: true });
  }
  fs.mkdirSync(outDirSafari, { recursive: true });

  copyFolderRecursive(outDir, outDirSafari);

  const safariManifestPath = path.join(outDirSafari, 'manifest.json');
  const safariManifest = JSON.parse(fs.readFileSync(safariManifestPath, 'utf8'));

  // Safari MV3 manifest refinements
  if (!safariManifest.browser_specific_settings) {
    safariManifest.browser_specific_settings = {
      safari: {
        strict_min_version: '15.4',
      },
    };
  }

  fs.writeFileSync(safariManifestPath, JSON.stringify(safariManifest, null, 2));

  console.log('Safari-optimized WebExtension build completed inside dist-extension-safari/ !');
}

build().catch((err) => {
  console.error('Extension build failed:', err);
  process.exit(1);
});
