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
