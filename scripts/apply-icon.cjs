const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

// src-tauri/icon-source/kalderashield-icon.svg is the master: the orange-black
// obsidian-and-magma caldera. Every raster surface in the product is rendered
// from it, so this is the default source.
//
// The previous default was assets/KalderaShield-app-icon-true.png, which is the
// cyan/purple shield from the pre-7.0.7.0 rebrand and is still on disk. Running
// `npm run icon:apply` with no arguments therefore regenerated the whole icon
// set -- including every Android mipmap and the APK launcher icon -- back into
// the retired mark, while the flag that fixed it (--vector) was the non-default
// path. The two disagreed and the wrong one was the default.
//
// assets/KalderaShield-app-icon-true.png is kept only as a reference image;
// pass it explicitly if the old mark is ever wanted again:
//   node scripts/apply-icon.cjs assets/KalderaShield-app-icon-true.png
let sourceIcon = path.join(root, 'src-tauri', 'icon-source', 'kalderashield-icon.svg');

if (args.includes('--vector') || args.includes('vector')) {
  sourceIcon = path.join(root, 'assets', 'KalderaShield-vector-icon.png');
} else if (args[0] && !args[0].startsWith('-') && fs.existsSync(path.resolve(args[0]))) {
  sourceIcon = path.resolve(args[0]);
}

console.log(`[KalderaShield Icon] Applying icon from: ${sourceIcon}`);

if (!fs.existsSync(sourceIcon)) {
  console.error(`Source icon not found at: ${sourceIcon}`);
  process.exit(1);
}

// 1. Run tauri icon generator
console.log('[1/5] Generating multi-platform desktop/mobile icons with Tauri CLI...');
try {
  // Argument array, never an interpolated shell string. sourceIcon can come from
  // argv (line 26), so the old `npx tauri icon "${sourceIcon}"` handed a path
  // straight to the shell -- apply-icon.cjs "a.png; <command>" would have run
  // that command. CodeQL reported it as js/indirect-command-line-injection.
  //
  // The obvious fix, execFileSync('npx', [...]), does not work on Windows:
  // npx is npx.cmd, and since Node 20.12 spawning a .cmd without a shell is
  // refused, precisely to stop this class of injection. Passing shell: true
  // would satisfy the runtime and undo the fix.
  //
  // So the CLI's JavaScript entry point is run by node directly. Read from the
  // package's bin field rather than hardcoded, so a CLI major that moves the
  // file does not silently break icon regeneration. No shell anywhere.
  const cliPkg = require.resolve('@tauri-apps/cli/package.json', { paths: [root] });
  const cliBin = require(cliPkg).bin.tauri;
  const cliEntry = path.resolve(path.dirname(cliPkg), cliBin);

  execFileSync(process.execPath, [cliEntry, 'icon', sourceIcon], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
} catch (e) {
  console.error('Failed to run tauri icon:', e.message);
  process.exit(1);
}

  // 2. Finish the Android half. `tauri icon` writes src-tauri/icons/android,
  //    which is the template the Gradle project was initialised from; the
  //    directory Gradle actually builds is
  //    src-tauri/gen/android/app/src/main/res. Nothing copied one to the other,
  //    so an icon regeneration used to leave the APK on the previous mark
  //    unless someone remembered to copy by hand.
  console.log('[2/5] Applying Android launcher icon, adaptive icon and TV banner...');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'android-icons.cjs')], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Failed to apply the Android icons:', e.message);
    process.exit(1);
  }

  // 3. Ensure public web assets are synchronized
  console.log('[3/5] Updating public web & favicon assets...');
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

  // 4. The in-app logos. These were the assets the icon set never reached:
  //    tauri icon writes src-tauri/icons, the Android mipmaps and the iOS set,
  //    but src/components/LockScreen.tsx and index.html import from public/ and
  //    assets/ directly, so the app kept showing the previous mark after every
  //    other surface had changed.
  console.log('[4/5] Rendering the in-app logos (lock screen, sidebar, splash)...');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'render-app-logo.cjs')], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Failed to render the in-app logos:', e.message);
    process.exit(1);
  }

  // 5. Prove the result rather than assume it. This is the check that would
  //    have caught every drift above at the point it was introduced.
  console.log('[5/5] Verifying every icon surface points at the current master...');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify-icons.cjs')], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Icon verification failed:', e.message);
    process.exit(1);
  }

  console.log('Done! All KalderaShield icons successfully applied.');
