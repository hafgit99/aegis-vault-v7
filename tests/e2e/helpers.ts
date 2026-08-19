import { expect, type Page } from '@playwright/test';

export async function setupVault(page: Page, masterPassword: string) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);
  await page.getByTestId('lock-terms-checkbox').check();
  await page.getByTestId('lock-remember-secret-key-checkbox').check();
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

export async function unlockVault(page: Page, masterPassword: string) {
  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();
}

export async function createLoginItem(
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

export async function openSettings(page: Page) {
  await page.getByTestId('nav-settings-button').click();
  await expect(page.getByTestId('plain-export-button')).toBeVisible();
}

export async function exportEncryptedBackup(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('encrypted-export-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(/^aegis_guvenli_yedek_\d{4}-\d{2}-\d{2}\.aegis$/);
  expect(downloadPath).toBeTruthy();

  return downloadPath!;
}