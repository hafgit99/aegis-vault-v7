import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('dist-extension');
const batPath = path.join(distDir, 'aegis-host.bat');
const manifestPath = path.join(distDir, 'com.hafgit99.aegisvault7.json');

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
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
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

const manifestContent = {
  name: "com.hafgit99.aegisvault7",
  description: "Aegis Vault Native Messaging Host",
  path: selectedExe,
  type: "stdio",
  allowed_origins: allowedOrigins,
  allowed_extensions: [
    "aegisvault7@hafgit99.com"
  ]
};

fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2));
console.log(`Created: ${manifestPath}`);

// 3. Register on Windows Registry via PowerShell
if (process.platform === 'win32') {
  try {
    console.log('Registering Host in Windows Registry for Chrome, Edge, and Firefox...');
    
    const paths = [
      `HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.hafgit99.aegisvault7`,
      `HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.hafgit99.aegisvault7`,
      `HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\com.hafgit99.aegisvault7`
    ];

    for (const regPath of paths) {
      // Create path if not exists
      const checkCmd = `powershell -Command "if (!(Test-Path '${regPath}')) { New-Item -Path '${regPath}' -Force | Out-Null }"`;
      execSync(checkCmd);
      
      // Set default value pointing to manifest JSON
      const setCmd = `powershell -Command "Set-ItemProperty -Path '${regPath}' -Name '(Default)' -Value '${manifestPath}' -Force"`;
      execSync(setCmd);
    }
    
    console.log('Windows Registry keys updated successfully!');
  } catch (error) {
    console.error('Failed to update Windows Registry:', error.message);
    console.log('\n--- MANUAL REGISTRY INSTRUCTIONS ---');
    console.log('Please run the following commands in an Administrator PowerShell to register the host:');
    console.log(`New-Item -Path "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.hafgit99.aegisvault7" -Force`);
    console.log(`Set-ItemProperty -Path "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.hafgit99.aegisvault7" -Name "(Default)" -Value "${manifestPath}"`);
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
      fs.copyFileSync(manifestPath, path.join(dir, 'com.hafgit99.aegisvault7.json'));
      console.log(`Copied manifest to: ${dir}`);
    } catch (e) {
      console.warn(`Could not write to: ${dir}`, e.message);
    }
  });
}
