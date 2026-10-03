// Fails closed when an icon surface drifts away from the master mark.
//
// The brand is one vector -- src-tauri/icon-source/kalderashield-icon.svg --
// fanned out across a dozen raster and XML surfaces. Nothing in the build
// compared them, so every drift found so far was found by looking at a built
// APK or a running app:
//
//   * `npm run icon:apply` defaulted to assets/KalderaShield-app-icon-true.png,
//     the cyan/purple shield from before the 7.0.7.0 rebrand, so regenerating
//     the icon set with no arguments reverted the Android launcher icon to the
//     retired mark.
//   * `tauri icon` writes src-tauri/icons/android, which is the template the
//     Gradle project was initialised from. Gradle builds
//     src-tauri/gen/android/app/src/main/res. No step copied one into the
//     other, so a regeneration never reached the APK.
//   * ic_launcher_background was the Android Studio default #fff while the
//     foreground layer already paints the dark squircle, giving a white tile
//     with a dark tile inside it.
//   * public/app-icon.png and public/favicon.ico were still the cyan files.
//   * The splash drew an emerald Lucide ShieldCheck, a palette that appears
//     nowhere else in the product.
//
// Run standalone (`npm run icons:verify`) or as the last step of icon:apply.
// The gate is byte comparison for copied surfaces and a recorded sha256 for
// surfaces produced by a browser render: rendering the master again would need a
// browser, which CI does not have. The digest is written beside each raster at
// render time by render-app-logo.cjs, so a stale render is detectable without
// one.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const iconsAndroidDir = path.join(rootDir, 'src-tauri', 'icons', 'android');
const genResDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
const masterSvg = path.join(rootDir, 'src-tauri', 'icon-source', 'kalderashield-icon.svg');

const EXPECTED_BACKGROUND = '#080a0f';

// Android TV banner ladder: 320x180 at xhdpi is the documented reference size.
const TV_BANNER_SIZES = [
  ['drawable-mdpi', 320, 180],
  ['drawable-hdpi', 480, 270],
  ['drawable-xhdpi', 640, 360],
  ['drawable-xxhdpi', 960, 540],
  ['drawable-xxxhdpi', 1280, 720],
];

// Copied verbatim from src-tauri/icons/android by scripts/android-icons.cjs.
const MIPMAP_DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const COPIED_ANDROID_RESOURCES = [
  'mipmap-anydpi-v26/ic_launcher.xml',
  'values/ic_launcher_background.xml',
  ...MIPMAP_DENSITIES.flatMap((density) => [
    `mipmap-${density}/ic_launcher.png`,
    `mipmap-${density}/ic_launcher_foreground.png`,
    `mipmap-${density}/ic_launcher_round.png`,
  ]),
];

// Files `tauri android init` leaves behind. None is referenced:
// mipmap-anydpi-v26/ic_launcher.xml points at @mipmap/ic_launcher_foreground
// and @color/ic_launcher_background.
const FORBIDDEN_ANDROID_RESOURCES = [
  'drawable/ic_launcher_background.xml',
  'drawable-v24/ic_launcher_foreground.xml',
];

// Byte-for-byte copies out of src-tauri/icons.
const COPIED_ICON_FILES = [
  ['src-tauri/icons/icon.png', 'public/app-icon.png'],
  ['src-tauri/icons/32x32.png', 'public/favicon-32x32.png'],
  ['src-tauri/icons/icon.ico', 'public/favicon.ico'],
];

// Browser renders of the master, so freshness is the only signal available.
const RENDERED_ICON_FILES = ['assets/KalderaShield-app-icon.png', 'public/splash-icon.png'];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// PNG IHDR: 8-byte signature, then width and height as big-endian uint32.
function pngSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

// The checks below are about what the surface renders, not about what the file
// says about it, and several of these files carry comments explaining the
// history being checked for. Comments are stripped first so the explanation does
// not trip the assertion.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collectIssues() {
  const issues = [];
  const add = (message) => issues.push(message);
  const rel = (file) => path.relative(rootDir, file).replace(/\\/g, '/');

  if (!fs.existsSync(masterSvg)) {
    add(`missing master icon vector: ${rel(masterSvg)}`);
    return issues;
  }

  if (!fs.existsSync(genResDir)) {
    add(`missing Gradle resource directory: ${rel(genResDir)} (run \`npm run android:init\`)`);
    return issues;
  }

  for (const relPath of FORBIDDEN_ANDROID_RESOURCES) {
    if (fs.existsSync(path.join(genResDir, ...relPath.split('/')))) {
      add(`${rel(genResDir)}/${relPath} is a stale Android Studio template resource; run \`npm run icon:apply\``);
    }
  }

  for (const relPath of COPIED_ANDROID_RESOURCES) {
    const source = path.join(iconsAndroidDir, ...relPath.split('/'));
    const target = path.join(genResDir, ...relPath.split('/'));
    if (!fs.existsSync(source)) {
      add(`missing ${rel(source)}`);
      continue;
    }
    if (!fs.existsSync(target)) {
      add(`${rel(genResDir)}/${relPath} was never synced from ${rel(iconsAndroidDir)}; run \`npm run icon:apply\``);
      continue;
    }
    if (sha256(source) !== sha256(target)) {
      add(`${rel(genResDir)}/${relPath} differs from ${rel(source)}; run \`npm run icon:apply\``);
    }
  }

  // The adaptive background is a plain string in XML, not a hashed file, so it
  // gets its own assertion. A second definition elsewhere in res/ is a duplicate
  // resource, not a fallback, so that is checked too.
  const backgroundFile = path.join(genResDir, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(backgroundFile)) {
    const declared = /<color\s+name="ic_launcher_background"\s*>([^<]+)<\/color>/.exec(readText(backgroundFile));
    if (!declared) {
      add(`${rel(backgroundFile)} does not define ic_launcher_background`);
    } else if (declared[1].trim().toLowerCase() !== EXPECTED_BACKGROUND) {
      add(`ic_launcher_background is ${declared[1].trim()}, expected ${EXPECTED_BACKGROUND}; the launcher showed a white tile around the mark`);
    }
  }

  const valuesDir = path.join(genResDir, 'values');
  for (const entry of fs.existsSync(valuesDir) ? fs.readdirSync(valuesDir, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !entry.name.endsWith('.xml')) continue;
    const file = path.join(genResDir, 'values', entry.name);
    if (file === backgroundFile) continue;
    if (/<color\s+name="ic_launcher_background"/.test(readText(file))) {
      add(`${rel(file)} also defines ic_launcher_background, which is a duplicate resource`);
    }
  }

  for (const [density, width, height] of TV_BANNER_SIZES) {
    const file = path.join(genResDir, density, 'kalderashield_tv_banner.png');
    if (!fs.existsSync(file)) {
      add(`missing ${rel(file)}`);
      continue;
    }
    const size = pngSize(file);
    if (!size) {
      add(`${rel(file)} is not a readable PNG`);
    } else if (size.width !== width || size.height !== height) {
      add(`${rel(file)} is ${size.width}x${size.height}, expected ${width}x${height}`);
    }
  }

  for (const [source, target] of COPIED_ICON_FILES) {
    const sourcePath = path.join(rootDir, ...source.split('/'));
    const targetPath = path.join(rootDir, ...target.split('/'));
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
      add(`missing ${fs.existsSync(sourcePath) ? target : source}`);
      continue;
    }
    if (sha256(sourcePath) !== sha256(targetPath)) {
      add(`${target} is not a copy of ${source}; run \`npm run icon:apply\``);
    }
  }

  /* Rasterised surfaces are checked against the sha256 of the master recorded
   * beside them at render time, not against their mtime.
   *
   * mtime was a coin flip. `git checkout` writes files in directory order, so
   * src-tauri/icon-source/kalderashield-icon.svg is written after the PNGs whose
   * names sort before it -- KalderaShield-app-icon.png, splash-icon.png -- and
   * every clean checkout therefore looked like the renders predated the master.
   * The gate passed locally only because those files happened to be touched in
   * a lucky order, and failed on CI's clean checkout of the very same commit.
   * A timestamp cannot distinguish "stale render" from "written earlier in the
   * same second by a checkout", and only the hash can tell them apart.
   *
   * A missing .icon-source is reported rather than skipped: the stamp is what
   * makes this check possible at all, so a render made before it existed has to
   * be re-made rather than quietly unverified. */
  const masterDigest = sha256(masterSvg);
  for (const relPath of RENDERED_ICON_FILES) {
    const file = path.join(rootDir, ...relPath.split('/'));
    if (!fs.existsSync(file)) {
      add(`missing ${relPath}; run \`npm run icon:apply\``);
      continue;
    }

    const stampFile = file + '.icon-source';
    if (!fs.existsSync(stampFile)) {
      add(
        `missing ${rel(stampFile)}: ${relPath} has no record of which master it was ` +
          'rendered from; run `npm run icon:apply`'
      );
      continue;
    }

    const recorded = readText(stampFile).trim();
    if (recorded !== masterDigest) {
      add(
        `${relPath} was rendered from a different ${rel(masterSvg)}; ` +
          'run `npm run icon:apply`'
      );
    }
  }

  // Source-level guards. The point is that a splash drawn in Lucide rather than
  // from the master cannot be caught by comparing files.
  const indexHtml = readText(path.join(rootDir, 'index.html'));
  for (const href of ['/app-icon.png', '/splash-icon.png']) {
    if (!indexHtml.includes(`href="${href}"`) && !indexHtml.includes(`src="${href}"`)) {
      add(`index.html does not reference ${href}`);
    }
  }
  if (/viewBox="0 0 24 24"/.test(indexHtml)) {
    add('index.html still draws an inline 24x24 Lucide glyph on the splash instead of the caldera mark');
  }

  for (const relPath of ['public/splash.css', 'src/components/AppSplashLoader.tsx']) {
    const file = path.join(rootDir, ...relPath.split('/'));
    if (!fs.existsSync(file)) continue;
    if (/emerald|#4ade80|#22c55e/i.test(stripComments(readText(file)))) {
      add(`${relPath} still carries the retired emerald accent`);
    }
  }

  const sidebar = path.join(rootDir, 'src', 'components', 'SidebarNavigation.tsx');
  if (fs.existsSync(sidebar) && stripComments(readText(sidebar)).includes('src-tauri/icons/')) {
    add('src/components/SidebarNavigation.tsx imports src-tauri/icons/ directly instead of the shared in-app logo');
  }

  return issues;
}

function main() {
  const issues = collectIssues();
  if (issues.length) {
    console.error('KalderaShield icon verification failed:');
    for (const issue of issues) console.error(`  - ${issue}`);
    console.error('\nRun `npm run icon:apply` to regenerate every icon surface from the master vector.');
    process.exit(1);
  }
  console.log('KalderaShield icon verification passed: every surface points at src-tauri/icon-source/kalderashield-icon.svg.');
}

if (require.main === module) main();

module.exports = { EXPECTED_BACKGROUND, collectIssues, main, pngSize, stripComments };