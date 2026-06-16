import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOST_NAME = 'com.hafgit99.aegisvault7';
const FIREFOX_EXTENSION_ID = 'aegisvault7@hafgit99.com';

const distDir = path.resolve('dist-extension');
const firefoxDistDir = path.resolve('dist-extension-firefox');
const batPath = path.join(distDir, 'aegis-host.bat');
const chromeManifestPath = path.join(distDir, `${HOST_NAME}.json`);
const firefoxManifestPath = path.join(firefoxDistDir, `${HOST_NAME}.json`);

const isWin = process.platform === 'win32';
const exeName = isWin ? 'aegis-vault-v7.exe' : 'aegis-vault-v7';
const debugExe = path.resolve('src-tauri/target/debug', exeName);
const releaseExe = path.resolve('src-tauri/target/release', exeName);

let selectedExe = releaseExe;
if (fs.existsSync(debugExe)) {
  selectedExe = debugExe;
  console.log(`Using debug binary: ${selectedExe}`);
} else if (fs.existsSync(releaseExe)) {
  console.log(`Using release binary: ${selectedExe}`);
} else {
  console.warn(`Warning: No compiled binary found at ${debugExe} or ${releaseExe}. Defaulting path to release binary.`);
}

// 1. Create aegis-host.bat with fallback logic (kept for back-compat)
const batContent = `@echo off
if exist "${debugExe}" (
  "${debugExe}" --native-messaging-host %*
) else (
  "${releaseExe}" --native-messaging-host %*
)
`;
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(firefoxDistDir, { recursive: true });
fs.writeFileSync(batPath, batContent);
console.log(`Created: ${batPath}`);

// 2. Create com.hafgit99.aegisvault7.json
// Note: Chrome/Edge do NOT support wildcards (*) in allowed_origins.
// We must specify the exact extension ID. We read it from command line arguments.
const extensionId = process.argv[2];
const allowedOrigins = [
  "chrome-extension://bfjfdbphbmdfinjddbbegnlclanbpnch/", // User's Extension ID
  "chrome-extension://cojgpfjcljepclmjldmdcfbghidmfgph/", // Default Placeholder
  "chrome-extension://hhpldpjhbmdepocpffccmdofgebgkclg/"  // Default Placeholder
];

if (extensionId) {
  // Normalize extension ID if it has protocol prefix or trailing slash
  let cleanId = extensionId.replace('chrome-extension://', '').replace('/', '');
  allowedOrigins.push(`chrome-extension://${cleanId}/`);
  console.log(`Adding allowed origin: chrome-extension://${cleanId}/`);
} else {
  console.log('No extension ID provided. You can pass it as: npm run register:extension <extension-id>');
}

const baseManifest = {
  name: HOST_NAME,
  description: "Aegis Vault Native Messaging Host",
  path: selectedExe,
  type: "stdio"
};

const chromeManifestContent = {
  ...baseManifest,
  allowed_origins: allowedOrigins
};

const firefoxManifestContent = {
  ...baseManifest,
  allowed_extensions: [
    FIREFOX_EXTENSION_ID
  ]
};

fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifestContent, null, 2));
fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifestContent, null, 2));
console.log(`Created Chrome/Edge manifest: ${chromeManifestPath}`);
console.log(`Created Firefox manifest: ${firefoxManifestPath}`);

// 3. Register on Windows Registry via PowerShell
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
      // Create path if not exists
      const checkCmd = `powershell -Command "if (!(Test-Path '${entry.path}')) { New-Item -Path '${entry.path}' -Force | Out-Null }"`;
      execSync(checkCmd);
      
      // Set default value pointing to manifest JSON
      const setCmd = `powershell -Command "Set-ItemProperty -Path '${entry.path}' -Name '(Default)' -Value '${entry.manifest}' -Force"`;
      execSync(setCmd);
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
    console.log(`New-Item -Path "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" -Force`);
    console.log(`Set-ItemProperty -Path "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" -Name "(Default)" -Value "${chromeManifestPath}"`);
    console.log(`New-Item -Path "HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" -Force`);
    console.log(`Set-ItemProperty -Path "HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" -Name "(Default)" -Value "${firefoxManifestPath}"`);
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
