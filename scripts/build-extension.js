import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('dist-extension');
const srcDir = path.resolve('src-extension');

// Ensure outDir exists
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

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
  console.log('Compiling extension TS files using esbuild...');
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
    minify: false, // Let's keep it false in dev/local build so it's easy to debug and read, or make it configurable
    sourcemap: true,
  });

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
}

build().catch((err) => {
  console.error('Extension build failed:', err);
  process.exit(1);
});
