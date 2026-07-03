import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const masterPassword = 'master-pass-e2e';

async function setupVault(page: Page) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);
  await expect(page.getByTestId('lock-emergency-kit-button')).toBeVisible();
  await page.getByTestId('lock-remember-secret-key-checkbox').check();
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

async function createLoginItem(
  page: Page,
  title: string,
  options: { username?: string; password?: string; url?: string; notes?: string } = {},
) {
  await page.getByTestId('new-vault-item-button').click();
  await page.getByTestId('vault-item-title-input').fill(title);
  await page.getByTestId('vault-item-url-input').fill(options.url ?? 'https://github.com');
  await page.getByTestId('vault-item-username-input').fill(options.username ?? 'ada-e2e');
  await page.getByTestId('vault-item-password-input').fill(options.password ?? 'CorrectHorseBatteryStaple!42');
  await page.getByTestId('vault-item-notes-input').fill(options.notes ?? 'Created by the Playwright smoke suite.');
  await page.getByTestId('vault-item-save-button').click();

  const savedItem = page.getByTestId('vault-list-item').filter({ hasText: title });
  await expect(savedItem).toBeVisible();
  await expect(savedItem).toContainText(options.username ?? 'ada-e2e');

  return savedItem;
}

async function openSettings(page: Page) {
  await page.getByTestId('nav-settings-button').click();
  await expect(page.getByTestId('plain-export-button')).toBeVisible();
}

async function exportEncryptedBackup(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('encrypted-export-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(/^aegis_guvenli_yedek_\d{4}-\d{2}-\d{2}\.aegis$/);
  expect(downloadPath).toBeTruthy();

  return downloadPath!;
}

test('downloads an emergency kit during first-run setup', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('lock-emergency-kit-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toBe('aegis-vault-emergency-kit.txt');
  expect(downloadPath).toBeTruthy();
});

test('sets up, stores, locks, and unlocks a vault item', async ({ page }) => {
  await setupVault(page);

  await createLoginItem(page, 'E2E GitHub');

  await page.getByTestId('lock-vault-button').click();
  await expect(page.getByTestId('lock-confirm-password-input')).toBeHidden();

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E GitHub' })).toBeVisible();
});

test('restores persisted vault data after an app reload and unlock', async ({ page }) => {
  await setupVault(page);

  await createLoginItem(page, 'E2E Persisted Login', {
    username: 'persisted-user',
    password: 'PersistedPass!42',
    url: 'https://persist.example',
  });

  await page.reload();
  await expect(page.getByTestId('lock-password-input')).toBeVisible();
  await expect(page.getByTestId('lock-confirm-password-input')).toBeHidden();

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  const restoredItem = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Persisted Login' });
  await expect(restoredItem).toBeVisible();
  await expect(restoredItem).toContainText('persisted-user');

  await restoredItem.click();
  await expect(page.getByTestId('login-username-value')).toContainText('persisted-user');
});

test('reveals and copies login detail fields', async ({ page }) => {
  await setupVault(page);

  const savedItem = await createLoginItem(page, 'E2E Detail Actions');
  await savedItem.click();

  await expect(page.getByTestId('login-username-value')).toContainText('ada-e2e');
  await expect(page.getByTestId('login-password-value')).not.toContainText('CorrectHorseBatteryStaple!42');

  await page.getByTestId('login-password-reveal-button').click();
  await expect(page.getByTestId('login-password-value')).toContainText('CorrectHorseBatteryStaple!42');

  await page.getByTestId('login-username-copy-button').click();
  await expect(page.getByTestId('copy-toast-notification')).toBeVisible();

  await page.getByTestId('login-password-copy-button').click();
  await expect(page.getByTestId('copy-toast-notification')).toBeVisible();
});

test('moves a vault item to trash and restores it', async ({ page }) => {
  await setupVault(page);

  const savedItem = await createLoginItem(page, 'E2E Trash Restore');
  await savedItem.click();

  await page.getByTestId('delete-vault-item-button').click();
  await page.getByTestId('confirm-modal-confirm-button').click();

  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Trash Restore' })).toBeHidden();

  await page.getByTestId('nav-trash-button').click();
  const trashItem = page.getByTestId('trash-list-item').filter({ hasText: 'E2E Trash Restore' });
  await expect(trashItem).toBeVisible();

  await trashItem.getByTestId('restore-trash-item-button').click();
  await page.getByTestId('confirm-modal-confirm-button').click();

  await page.getByTestId('nav-vault-button').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Trash Restore' })).toBeVisible();
});

test('filters favorite vault items', async ({ page }) => {
  await setupVault(page);

  const favoriteItem = await createLoginItem(page, 'E2E Favorite Item');
  await createLoginItem(page, 'E2E Regular Item');

  await favoriteItem.click();
  await page.getByTestId('toggle-favorite-button').click();

  await page.getByTestId('vault-filter-favorites').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Favorite Item' })).toBeVisible();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Regular Item' })).toBeHidden();

  await page.getByTestId('vault-filter-all').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Favorite Item' })).toBeVisible();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Regular Item' })).toBeVisible();
});

test('filters vault items by search query', async ({ page }) => {
  await setupVault(page);

  await createLoginItem(page, 'E2E Search Alpha');
  await createLoginItem(page, 'E2E Search Beta');

  await page.getByTestId('vault-search-input').fill('Alpha');
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Search Alpha' })).toBeVisible();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Search Beta' })).toBeHidden();

  await page.getByTestId('vault-search-input').fill('');
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Search Alpha' })).toBeVisible();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Search Beta' })).toBeVisible();
});

test('shows an empty state when search has no matches', async ({ page }) => {
  await setupVault(page);

  await createLoginItem(page, 'E2E Empty State Anchor');

  await page.getByTestId('vault-search-input').fill('no-such-e2e-entry');
  await expect(page.getByTestId('vault-empty-state')).toBeVisible();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Empty State Anchor' })).toBeHidden();

  await page.getByTestId('vault-search-input').fill('');
  await expect(page.getByTestId('vault-empty-state')).toBeHidden();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Empty State Anchor' })).toBeVisible();
});

test('reports weak and reused passwords in the security audit', async ({ page }) => {
  await page.route('https://api.pwnedpasswords.com/range/**', async (route) => {
    await route.fulfill({ status: 503, body: '' });
  });

  await setupVault(page);
  await createLoginItem(page, 'E2E Weak Audit Item', { username: 'weak-user', password: '12345' });
  await createLoginItem(page, 'E2E Reused Audit One', { username: 'reuse-one', password: 'SharedAuditPass!42' });
  await createLoginItem(page, 'E2E Reused Audit Two', { username: 'reuse-two', password: 'SharedAuditPass!42' });

  await page.getByTestId('nav-audit-button').click();
  await expect(page.getByTestId('audit-workspace')).toBeVisible();
  await expect(page.getByTestId('security-audit-weak-count')).toHaveText('1');
  await expect(page.getByTestId('security-audit-reused-count')).toHaveText('2');
  await expect(page.getByTestId('security-audit-weak-item').filter({ hasText: 'E2E Weak Audit Item' })).toBeVisible();
  await expect(page.getByTestId('security-audit-reused-item').filter({ hasText: 'E2E Reused Audit One' })).toBeVisible();
  await expect(page.getByTestId('security-audit-reused-item').filter({ hasText: 'E2E Reused Audit Two' })).toBeVisible();

  await page.getByTestId('security-audit-weak-item').filter({ hasText: 'E2E Weak Audit Item' }).click();
  await expect(page.getByTestId('login-username-value')).toContainText('weak-user');
});

test('navigates across primary workspaces and returns to the vault', async ({ page }) => {
  await setupVault(page);

  await page.getByTestId('nav-audit-button').click();
  await expect(page.getByTestId('audit-workspace')).toBeVisible();

  await page.getByTestId('nav-generator-button').click();
  await expect(page.getByTestId('generator-workspace')).toBeVisible();

  await page.getByTestId('nav-settings-button').click();
  await expect(page.getByTestId('settings-workspace')).toBeVisible();
  await expect(page.getByTestId('plain-export-button')).toBeVisible();

  await page.getByTestId('nav-trash-button').click();
  await expect(page.getByTestId('trash-workspace')).toBeVisible();

  await page.getByTestId('nav-vault-button').click();
  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
});

test('generates and copies a password from the generator workspace', async ({ page }) => {
  await setupVault(page);

  await page.getByTestId('nav-generator-button').click();
  await expect(page.getByTestId('generator-workspace')).toBeVisible();

  const output = page.getByTestId('password-generator-output');
  await expect(output).toBeVisible();

  const firstPassword = (await output.textContent())?.trim() ?? '';
  expect(firstPassword.length).toBeGreaterThanOrEqual(12);

  await page.getByTestId('password-generator-refresh-button').click();
  await expect.poll(async () => (await output.textContent())?.trim() ?? '').not.toBe(firstPassword);

  await page.getByTestId('password-generator-copy-button').click();
  await expect(page.getByTestId('copy-toast-notification')).toBeVisible();
});

test('runs the wa-sqlite migration UI safety gate', async ({ page }) => {
  test.setTimeout(180000); // Allow up to 3 minutes for multiple WASM KDF rounds
  await setupVault(page);
  await createLoginItem(page, 'E2E SQLite Migration Guard');
  await openSettings(page);

  const migrationButton = page.getByTestId('wa-sqlite-migration-button');
  await expect(migrationButton).toBeVisible();
  await expect(migrationButton).toBeEnabled();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('wa-sqlite');
    await dialog.accept();
  });

  await migrationButton.click();

  const migrationMessage = page.getByTestId('wa-sqlite-migration-message');
  await expect(migrationMessage).toBeVisible({ timeout: 20000 });
  await expect(migrationMessage).toContainText(/wa-sqlite/i);
  await expect(migrationButton).toBeEnabled();

  await page.getByTestId('confirm-modal-confirm-button').click();
  await expect(page.getByTestId('confirm-modal-confirm-button')).toBeHidden();

  await page.getByTestId('nav-vault-button').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E SQLite Migration Guard' })).toBeVisible();
});

test('switches the interface language between English and Chinese', async ({ page }) => {
  await setupVault(page);
  await openSettings(page);

  await page.getByTestId('language-select').selectOption('en');
  await expect(page.getByTestId('language-settings-card')).toContainText('Language and Region');
  await expect(page.getByTestId('nav-vault-button')).toContainText('Vault');
  await expect(page.getByTestId('nav-settings-button')).toContainText('Settings');

  await page.getByTestId('language-select').selectOption('zh');
  await expect(page.getByTestId('language-settings-card')).toContainText('语言和地区');
  await expect(page.getByTestId('nav-vault-button')).toContainText('保险库');
  await expect(page.getByTestId('nav-settings-button')).toContainText('设置');
});

test('renders the crypto donation page with wallet QR codes', async ({ page }) => {
  await setupVault(page);

  await page.getByTestId('nav-donate-button').click();
  await expect(page.getByTestId('donate-workspace')).toBeVisible();
  await expect(page.getByTestId('donation-panel')).toBeVisible();

  const btcWallet = page.getByTestId('donation-wallet-btc');
  await expect(btcWallet).toBeVisible();
  await expect(page.getByTestId('donation-address-btc')).toContainText('bc1qqsuljwzs32ckkqdrsdus7wgqzuetty3g0x47l7');
  await expect(page.getByTestId('donation-qr-btc')).toBeVisible();
  await expect(page.getByTestId('donation-wallet-eth')).toContainText('Ethereum');

  await page.getByTestId('donation-copy-btc').click();
  await expect(page.getByTestId('copy-toast-notification')).toBeVisible();
});

test('downloads an emergency kit from settings after unlock', async ({ page }) => {
  await setupVault(page);
  await openSettings(page);

  await expect(page.getByTestId('settings-emergency-kit-card')).toBeVisible();
  await expect(page.getByTestId('settings-emergency-secret-key-input')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('settings-emergency-kit-download-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toBe('aegis-vault-emergency-kit.txt');
  expect(downloadPath).toBeTruthy();
  await expect(page.getByTestId('settings-emergency-kit-success')).toBeVisible();
  await expect(page.getByTestId('settings-emergency-kit-error')).toBeHidden();
});

test('changes the master password, preserves data, and exports with the new session', async ({ page }) => {
  test.setTimeout(120000);
  const newMasterPassword = 'NewMasterPass!42';
  await setupVault(page);
  await createLoginItem(page, 'E2E Master Rotation', {
    username: 'rotated-user',
    password: 'RotatedVaultPass!42',
    url: 'https://rotation.example',
  });
  await openSettings(page);

  const passwordInputs = page.locator('#pass-change-form input[type="password"]');
  await passwordInputs.nth(0).fill(masterPassword);
  await passwordInputs.nth(1).fill(newMasterPassword);
  await passwordInputs.nth(2).fill(newMasterPassword);

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.locator('#pass-change-form button[type="submit"]').click();
  await expect(passwordInputs.nth(0)).toHaveValue('');
  await expect(passwordInputs.nth(1)).toHaveValue('');
  await expect(passwordInputs.nth(2)).toHaveValue('');

  await page.getByTestId('lock-vault-button').click();
  await expect(page.getByTestId('lock-password-input')).toBeVisible();
  await page.getByTestId('lock-password-input').fill(newMasterPassword);
  await page.getByTestId('lock-submit-button').click();

  await page.getByTestId('nav-vault-button').click();
  const restoredItem = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Master Rotation' });
  await expect(restoredItem).toBeVisible();
  await restoredItem.click();
  await expect(page.getByTestId('login-username-value')).toContainText('rotated-user');

  await openSettings(page);
  await exportEncryptedBackup(page);

  await page.reload();
  await expect(page.getByTestId('lock-password-input')).toBeVisible();
  await page.getByTestId('lock-password-input').fill(newMasterPassword);
  await page.getByTestId('lock-submit-button').click();

  await page.getByTestId('nav-vault-button').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Master Rotation' })).toBeVisible();
});

test('exports an encrypted backup download', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Export Backup');
  await openSettings(page);

  await exportEncryptedBackup(page);
});

test('exports a confirmed plain JSON backup download', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Plain Export', {
    username: 'plain-export-user',
    password: 'PlainExportPass!42',
    url: 'https://plain-export.example',
  });
  await openSettings(page);

  await page.getByTestId('plain-export-button').click();
  await expect(page.getByTestId('plain-export-warning')).toBeVisible();
  await page.getByTestId('plain-export-confirm-input').fill('EXPORT');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('plain-export-confirm-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(/^aegis_acik_yedek_\d{4}-\d{2}-\d{2}\.json$/);
  expect(downloadPath).toBeTruthy();

  const exportedItems = JSON.parse(await fs.readFile(downloadPath!, 'utf8'));
  expect(exportedItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: 'E2E Plain Export',
        username: 'plain-export-user',
        password: 'PlainExportPass!42',
        url: 'https://plain-export.example',
      }),
    ]),
  );
});

test('imports a plain JSON backup file', async ({ page }) => {
  await setupVault(page);
  await openSettings(page);

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'aegis-e2e-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([
      {
        title: 'E2E Imported Login',
        username: 'imported-user',
        password: 'ImportedPass!42',
        url: 'https://import.example',
        notes: 'Imported through Playwright.',
        category: 'login',
      },
    ])),
  });

  await expect(page.getByTestId('import-success-message')).toBeVisible();

  await page.getByTestId('nav-vault-button').click();
  const importedItem = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Imported Login' });
  await expect(importedItem).toBeVisible();
  await expect(importedItem).toContainText('imported-user');
});

test('imports an encrypted aegis backup file', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Encrypted Import');
  await openSettings(page);

  const downloadPath = await exportEncryptedBackup(page);

  await page.getByTestId('import-file-input').setInputFiles(downloadPath);
  await page.getByTestId('decrypt-import-password-input').fill(masterPassword);
  await page.getByTestId('decrypt-import-submit-button').click();

  await expect(page.getByTestId('import-success-message')).toBeVisible();
  await expect(page.getByTestId('import-success-message')).toContainText('başarıyla çözüldü');

  await page.getByTestId('nav-vault-button').click();
  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E Encrypted Import' })).toBeVisible();
});

test('rejects encrypted aegis import with a wrong password', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Wrong Password Import');
  await openSettings(page);

  const downloadPath = await exportEncryptedBackup(page);

  await page.getByTestId('import-file-input').setInputFiles(downloadPath);
  await page.getByTestId('decrypt-import-password-input').fill('wrong-master-pass');
  await page.getByTestId('decrypt-import-submit-button').click();

  await expect(page.getByTestId('decrypt-import-error-message')).toBeVisible();
  await expect(page.getByTestId('decrypt-import-password-input')).toBeVisible();
  await expect(page.getByTestId('import-success-message')).toBeHidden();
});

test('cancels encrypted aegis import before decrypting', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Cancel Import');
  await openSettings(page);

  const downloadPath = await exportEncryptedBackup(page);

  await page.getByTestId('import-file-input').setInputFiles(downloadPath);
  await expect(page.getByTestId('decrypt-import-password-input')).toBeVisible();

  await page.getByTestId('decrypt-import-cancel-button').click();

  await expect(page.getByTestId('decrypt-import-password-input')).toBeHidden();
  await expect(page.getByTestId('import-file-input')).toBeAttached();
  await expect(page.getByTestId('import-success-message')).toBeHidden();
});
