const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'src');

const forbiddenPatterns = [
  'withActiveMasterPassword',
  'getActiveMasterPassword',
  'masterPasswordPlain',
  'passwordPlain',
  'deriveEncryptionKey',
  'activeCredentialBytes',
  'activeBackupPasswordBytes',
  'activeAccountSecretKeyBytes'
];

// Baselines representing the exact approved occurrences of these patterns.
// If any other file uses them, or if these files increase their usage count, the gate fails.
const baseline = {
  'src/lib/vaultSession.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 0,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/storage.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 0,
    'passwordPlain': 0,
    'deriveEncryptionKey': 5,  // setup, setupWithSecretKey, change, openDerivedVaultSession, migrateActiveVaultStorageToWaSqlite
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/attachments.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 0,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/components/SettingsPanel.tsx': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 0,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/sqlite_opfs.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 8,
    'passwordPlain': 9,
    'deriveEncryptionKey': 9,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageMigration.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 15,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageMigrationDryRun.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 4,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageRepository.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 4,
    'passwordPlain': 3,
    'deriveEncryptionKey': 1,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageWaSqliteAdapter.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 2,
    'passwordPlain': 0,
    'deriveEncryptionKey': 2,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageMigrationCandidate.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 2,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/vaultStorageActiveMigration.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 3,
    'passwordPlain': 0,
    'deriveEncryptionKey': 0,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  },
  'src/lib/waSqliteVaultStorageRepository.ts': {
    'withActiveMasterPassword': 0,
    'getActiveMasterPassword': 0,
    'masterPasswordPlain': 9,
    'passwordPlain': 9,
    'deriveEncryptionKey': 7,
    'activeCredentialBytes': 0,
    'activeBackupPasswordBytes': 0,
    'activeAccountSecretKeyBytes': 0
  }
};

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (stat.isFile()) {
      callback(filePath);
    }
  }
}

function countOccurrences(content, pattern) {
  // Use regex to find occurrences of the exact pattern string (case-sensitive)
  const regex = new RegExp(pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function runScan() {
  console.log('Starting Aegis Vault 7 No-JS-Master-String Security Scan...');
  let hasFailed = false;
  const currentCounts = {};

  walkDir(srcDir, (filePath) => {
    // Relative path normalized with forward slashes for cross-platform compatibility
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    
    // Ignore test files
    if (
      relPath.endsWith('.test.ts') || 
      relPath.endsWith('.test.tsx') || 
      relPath.endsWith('.spec.ts') || 
      relPath.endsWith('.spec.tsx') ||
      relPath.includes('/__tests__/')
    ) {
      return;
    }

    // Only scan source files
    if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx') && !relPath.endsWith('.js') && !relPath.endsWith('.jsx')) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileMatches = {};
    let fileHasPattern = false;

    for (const pattern of forbiddenPatterns) {
      const count = countOccurrences(content, pattern);
      if (count > 0) {
        fileMatches[pattern] = count;
        fileHasPattern = true;
      }
    }

    if (fileHasPattern) {
      currentCounts[relPath] = fileMatches;

      // Check against baseline
      const fileBaseline = baseline[relPath];
      if (!fileBaseline) {
        console.error(`\x1b[31m[FAIL] Unauthorized master-string pattern usage in: ${relPath}\x1b[0m`);
        console.error(`  Patterns found: ${JSON.stringify(fileMatches)}`);
        hasFailed = true;
      } else {
        // File is in baseline, verify count bounds
        for (const pattern of forbiddenPatterns) {
          const count = fileMatches[pattern] || 0;
          const allowed = fileBaseline[pattern] || 0;
          if (count > allowed) {
            console.error(`\x1b[31m[FAIL] Pattern count exceeded in: ${relPath}\x1b[0m`);
            console.error(`  Pattern "${pattern}": found ${count}, allowed ${allowed}`);
            hasFailed = true;
          }
        }
      }
    }
  });

  // Verify if any baseline files no longer contain the patterns (so we can clean baseline)
  for (const relPath of Object.keys(baseline)) {
    const currentFileCounts = currentCounts[relPath] || {};
    const fileBaseline = baseline[relPath];
    for (const pattern of forbiddenPatterns) {
      const count = currentFileCounts[pattern] || 0;
      const allowed = fileBaseline[pattern] || 0;
      // If we use it less, that's fine, but let's notify the developer to keep baseline tight
      if (count < allowed) {
        console.log(`\x1b[33m[INFO] Pattern "${pattern}" in "${relPath}" is used ${count} times (baseline allows ${allowed}). Consider updating the baseline to be tighter.\x1b[0m`);
      }
    }
  }

  if (hasFailed) {
    console.error('\n\x1b[31m[ERROR] No-JS-Master-String final gate check FAILED. Please eliminate unauthorized plain-text master password usage.\x1b[0m');
    process.exit(1);
  } else {
    console.log('\n\x1b[32m[PASS] No-JS-Master-String final gate check passed successfully.\x1b[0m');
  }
}

if (require.main === module) {
  runScan();
}

module.exports = { runScan, countOccurrences, forbiddenPatterns, baseline };
