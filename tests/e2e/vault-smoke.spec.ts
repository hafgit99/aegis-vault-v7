import { expect, test, type Page } from '@playwright/test';

const masterPassword = 'master-pass-e2e';

async function setupVault(page: Page) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

async function createLoginItem(
  page: Page,
  title: string,
) {
  await page.getByTestId('new-vault-item-button').click();
  await page.getByTestId('vault-item-title-input').fill(title);
  await page.getByTestId('vault-item-url-input').fill('https://github.com');
  await page.getByTestId('vault-item-username-input').fill('ada-e2e');
  await page.getByTestId('vault-item-password-input').fill('CorrectHorseBatteryStaple!42');
  await page.getByTestId('vault-item-notes-input').fill('Created by the Playwright smoke suite.');
  await page.getByTestId('vault-item-save-button').click();

  const savedItem = page.getByTestId('vault-list-item').filter({ hasText: title });
  await expect(savedItem).toBeVisible();
  await expect(savedItem).toContainText('ada-e2e');

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

test('sets up, stores, locks, and unlocks a vault item', async ({ page }) => {
  await setupVault(page);

  await createLoginItem(page, 'E2E GitHub');

  await page.getByTestId('lock-vault-button').click();
  await expect(page.getByTestId('lock-confirm-password-input')).toBeHidden();

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E GitHub' })).toBeVisible();
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

test('exports an encrypted backup download', async ({ page }) => {
  await setupVault(page);
  await createLoginItem(page, 'E2E Export Backup');
  await openSettings(page);

  await exportEncryptedBackup(page);
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
