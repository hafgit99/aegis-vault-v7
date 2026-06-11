import { expect, test } from '@playwright/test';

const masterPassword = 'master-pass-e2e';

test('sets up, stores, locks, and unlocks a vault item', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();

  await page.getByTestId('new-vault-item-button').click();
  await page.getByTestId('vault-item-title-input').fill('E2E GitHub');
  await page.getByTestId('vault-item-url-input').fill('https://github.com');
  await page.getByTestId('vault-item-username-input').fill('ada-e2e');
  await page.getByTestId('vault-item-password-input').fill('CorrectHorseBatteryStaple!42');
  await page.getByTestId('vault-item-notes-input').fill('Created by the Playwright smoke suite.');
  await page.getByTestId('vault-item-save-button').click();

  const savedItem = page.getByTestId('vault-list-item').filter({ hasText: 'E2E GitHub' });
  await expect(savedItem).toBeVisible();
  await expect(savedItem).toContainText('ada-e2e');

  await page.getByTestId('lock-vault-button').click();
  await expect(page.getByTestId('lock-confirm-password-input')).toBeHidden();

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'E2E GitHub' })).toBeVisible();
});
