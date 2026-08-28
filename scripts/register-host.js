import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

import {
  buildChromeHostManifest,
  buildFirefoxHostManifest,
  chromeOriginFromId,
  collectValidatedOriginsFromObjects,
  FIREFOX_EXTENSION_ID,
  HOST_NAME,
  PRIMARY_CHROME_EXTENSION_ID,
} from './native-host-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// EXT-B2: host manifests embed a machine-specific absolute executable path,
// so they are generated at registration (install) time into a dedicated,
// gitignored directory — never inside extension build outputs and never in git.
const hostDir = path.resolve(projectRoot, 'native-host-local');
const registryHelperScript = path.resolve(__dirname, 'register-host-registry.ps1');
const chromiumHostDir = path.join(hostDir, 'chromium');
const firefoxHostDir = path.join(hostDir, 'firefox');
const batPath = path.join(chromiumHostDir, 'aegis-host.bat');
const chromeManifestPath = path.join(chromiumHostDir, `${HOST_NAME}.json`);
const firefoxManifestPath = path.join(firefoxHostDir, `${HOST_NAME}.json`);

// Legacy locations that previously (incorrectly) held host manifests; used
// once here to migrate already-registered extension IDs forward.
const legacyManifestPaths = [
  path.resolve(projectRoot, 'dist-extension', `${HOST_NAME}.json`),
  path.resolve(projectRoot, 'dist-extension-firefox', `${HOST_NAME}.json`),
  path.resolve(projectRoot, 'dist-extension-safari', `${HOST_NAME}.json`),
  path.resolve(projectRoot, 'release-local', 'windows', 'browser-extension', 'chromium', `${HOST_NAME}.json`),
  path.resolve(projectRoot, 'release-local', 'windows', 'browser-extension', 'firefox', `${HOST_NAME}.json`),
  path.resolve(projectRoot, 'release-local', 'windows', 'browser-extension', 'safari', `${HOST_NAME}.json`),
];

const isWin = process.platform === 'win32';
const exeName = isWin ? 'aegis-vault-v7.exe' : 'aegis-vault-v7';
const releaseExe = path.resolve(projectRoot, 'src-tauri/target/release', exeName);
const debugExe = path.resolve(projectRoot, 'src-tauri/target/debug', exeName);

// Prefer production release binary first, fall back to debug binary for local testing
let selectedExe = releaseExe;
if (fs.existsSync(releaseExe)) {
  selectedExe = releaseExe;
  console.log(`Using release binary: ${selectedExe}`);
} else if (fs.existsSync(debugExe)) {
  selectedExe = debugExe;
  console.log(`Using debug binary: ${selectedExe}`);
} else {
  console.warn(`Warning: No compiled binary found at ${releaseExe} or ${debugExe}. Defaulting path to release binary.`);
}

// 1. Create aegis-host.bat with release-first fallback logic
const batContent = `@echo off
if exist "${releaseExe}" (
  "${releaseExe}" --native-messaging-host %*
) else if exist "${debugExe}" (
  "${debugExe}" --native-messaging-host %*
) else (
  "${releaseExe}" --native-messaging-host %*
)
`;
fs.mkdirSync(chromiumHostDir, { recursive: true });
fs.mkdirSync(firefoxHostDir, { recursive: true });
fs.writeFileSync(batPath, batContent);
console.log(`Created: ${batPath}`);

// 2. Create com.hafgit99.aegisvault7.json
// Note: Chrome/Edge do NOT support wildcards (*) in allowed_origins.
// We only permit official/configured extension IDs and reject arbitrary placeholders.
const extensionId = process.argv[2] || process.env.AEGIS_EXTENSION_ID;

// EXT-B2: migrate origins from legacy manifests (dist-extension*/, release-local)
// so an existing local registration keeps working after the move to native-host-local/.
const legacyManifests = [];
for (const legacyPath of legacyManifestPaths) {
  try {
    if (fs.existsSync(legacyPath)) {
      legacyManifests.push(JSON.parse(fs.readFileSync(legacyPath, 'utf8')));
      console.log(`Migrating existing origins from legacy manifest: ${legacyPath}`);
    }
  } catch {
    console.warn(`Warning: could not parse legacy manifest at ${legacyPath}; skipping.`);
  }
}

const allowedOrigins = [
  chromeOriginFromId(PRIMARY_CHROME_EXTENSION_ID),
  ...collectValidatedOriginsFromObjects(legacyManifests),
].filter((origin, index, all) => origin !== null && !all.slice(0, index).includes(origin));
if (extensionId) {
  let cleanId = extensionId.replace(/^chrome-extension:\/\//, '').replace(/\/+$/, '').trim();
  if (/^[a-p]{32}$/i.test(cleanId)) {
    const formattedOrigin = `chrome-extension://${cleanId}/`;
    if (!allowedOrigins.includes(formattedOrigin)) {
      allowedOrigins.push(formattedOrigin);
      console.log(`Adding validated allowed origin: ${formattedOrigin}`);
    }
  } else {
    console.warn(`Warning: Provided extension ID '${cleanId}' is not a valid 32-char Chrome Extension ID format. Ignoring.`);
  }
} else {
  console.log('No extra extension ID provided. You can pass it as: npm run register:extension <extension-id>');
}

const chromeManifestContent = buildChromeHostManifest({
  hostPath: selectedExe,
  extensionIds: allowedOrigins.map((origin) =>
    origin.replace(/^chrome-extension:\/\//, '').replace(/\/+$/, ''),
  ),
});

const firefoxManifestContent = buildFirefoxHostManifest({
  hostPath: selectedExe,
  firefoxExtensionId: FIREFOX_EXTENSION_ID,
});

fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifestContent, null, 2));
fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifestContent, null, 2));
console.log(`Created Chrome/Edge manifest: ${chromeManifestPath}`);
console.log(`Created Firefox manifest: ${firefoxManifestPath}`);

// 3. Register on Windows Registry via reg.exe (argv-based, no shell string
// concatenation — injection-safe, and unlike `powershell -Command` it
// reliably binds the parameters)
if (process.platform === 'win32') {
  try {
    console.log('Registering Host in Windows Registry for Chrome, Edge, and Firefox...');
    
    const registryEntries = [
      {
        path: `HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
        manifest: chromeManifestPath
      },
      {
        path: `HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
        manifest: chromeManifestPath
      },
      {
        path: `HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
        manifest: firefoxManifestPath
      }
    ];

    for (const entry of registryEntries) {
      const regRes = spawnSync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        registryHelperScript,
        '-regPath',
        entry.path,
        '-manifestFile',
        entry.manifest,
      ], { stdio: 'inherit' });

      if (regRes.status !== 0) {
        throw new Error(`Failed to write registry entry for ${entry.path}`);
      }
    }

    const firefoxUserHostDir = path.join(
      process.env.APPDATA || '',
      'Mozilla',
      'NativeMessagingHosts'
    );
    if (process.env.APPDATA) {
      fs.mkdirSync(firefoxUserHostDir, { recursive: true });
      fs.copyFileSync(firefoxManifestPath, path.join(firefoxUserHostDir, `${HOST_NAME}.json`));
      console.log(`Copied Firefox manifest to: ${firefoxUserHostDir}`);
    }
    
    console.log('Windows Registry keys updated successfully!');
  } catch (error) {
    console.error('Failed to update Windows Registry:', error.message);
    console.log('\n--- MANUAL REGISTRY INSTRUCTIONS ---');
    console.log('Please run the following commands in an Administrator PowerShell to register the host:');
    console.log(`New-Item -Path "HKCU:\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" -Force`);
    console.log(`Set-ItemProperty -Path "HKCU:\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" -Name "(Default)" -Value "${chromeManifestPath}"`);
    console.log(`New-Item -Path "HKCU:\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" -Force`);
    console.log(`Set-ItemProperty -Path "HKCU:\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" -Name "(Default)" -Value "${firefoxManifestPath}"`);
  }
} else {
  console.log('Registering Host for macOS/Linux...');
  // Standard paths for Chrome/Firefox native messaging manifests
  const homeDir = process.env.HOME || '';
  const chromePath = path.join(homeDir, 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  const firefoxPath = path.join(homeDir, 'Library/Application Support/Mozilla/NativeMessagingHosts');

  // Copy manifest to standard directories
  [chromePath, firefoxPath].forEach(dir => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const sourceManifest = dir === firefoxPath ? firefoxManifestPath : chromeManifestPath;
      fs.copyFileSync(sourceManifest, path.join(dir, `${HOST_NAME}.json`));
      console.log(`Copied manifest to: ${dir}`);
    } catch (e) {
      console.warn(`Could not write to: ${dir}`, e.message);
    }
  });
}
