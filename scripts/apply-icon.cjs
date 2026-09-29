const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

let sourceIcon = path.join(root, 'assets', 'KalderaShield-app-icon-true.png');

if (args.includes('--vector') || args.includes('vector')) {
  sourceIcon = path.join(root, 'assets', 'KalderaShield-vector-icon.png');
} else if (args[0] && fs.existsSync(path.resolve(args[0]))) {
  sourceIcon = path.resolve(args[0]);
}

console.log(`[KalderaShield Icon] Applying icon from: ${sourceIcon}`);

if (!fs.existsSync(sourceIcon)) {
  console.error(`Source icon not found at: ${sourceIcon}`);
  process.exit(1);
}

  // 1. Run tauri icon generator
  console.log('[1/4] Generating multi-platform desktop/mobile icons with Tauri CLI...');
  try {
    execSync(`npx tauri icon "${sourceIcon}"`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to run tauri icon:', e.message);
    process.exit(1);
  }

  // 2. Ensure public web assets are synchronized
  console.log('[2/4] Updating public web & favicon assets...');
  const publicDir = path.join(root, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy icon.png and 32x32 to public
  const tauriIconsDir = path.join(root, 'src-tauri', 'icons');
  fs.copyFileSync(path.join(tauriIconsDir, 'icon.png'), path.join(publicDir, 'app-icon.png'));
  fs.copyFileSync(path.join(tauriIconsDir, '32x32.png'), path.join(publicDir, 'favicon-32x32.png'));
  if (fs.existsSync(path.join(tauriIconsDir, 'icon.ico'))) {
    fs.copyFileSync(path.join(tauriIconsDir, 'icon.ico'), path.join(publicDir, 'favicon.ico'));
  }

  // 3. The in-app logo the lock screen draws. This was the one asset the icon
  //    set never reached: tauri icon writes src-tauri/icons, the Android
  //    mipmaps and the iOS set, but src/components/LockScreen.tsx imports
  //    ../../assets/KalderaShield-app-icon.png directly, so the app kept
  //    showing the previous mark on the lock screen after every other surface
  //    had changed.
  console.log('[3/4] Rendering the in-app lock screen logo...');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'render-app-logo.cjs')], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Failed to render the in-app logo:', e.message);
    process.exit(1);
  }

  console.log('[4/4] Done! All KalderaShield icons successfully applied.');
