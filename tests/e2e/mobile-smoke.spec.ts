import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupVault } from './helpers';

const masterPassword = 'master-pass-mobile-e2e';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function openMobileNavigation(page: Page) {
  await page.getByTestId('topbar-menu-button').click();
  await expect(page.getByTestId('nav-settings-button')).toBeVisible();
}

async function expectInsideViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
}

test('keeps the mobile lock screen controls inside the viewport', async ({ page }) => {
  await page.goto('/');

  await expectInsideViewport(page.getByTestId('lock-language-select'));
  await expectInsideViewport(page.getByTestId('lock-password-input'));
  await expect(page.getByTestId('lock-submit-button')).toBeVisible();
});

test('shows a usable mobile dashboard lock action after setup', async ({ page }) => {
  await setupVault(page, masterPassword);

  await page.getByTestId('vault-dashboard-card').click();
  const mobileLockButton = page.getByTestId('mobile-dashboard-lock-button');
  await expectInsideViewport(mobileLockButton);

  await mobileLockButton.click();
  await expect(page.getByTestId('lock-password-input')).toBeVisible();
});

test('keeps mobile item creation and settings controls reachable', async ({ page }) => {
  await setupVault(page, masterPassword);

  await page.getByTestId('new-vault-item-button').click();
  await expect(page.getByTestId('vault-item-title-input')).toBeVisible();
  await expect(page.getByTestId('vault-item-category-login')).toBeVisible();

  await page.getByTestId('vault-item-title-input').fill('Mobile Smoke Login');
  await page.getByTestId('vault-item-url-input').fill('https://mobile-smoke.example');
  await page.getByTestId('vault-item-username-input').fill('mobile-user');
  await page.getByTestId('vault-item-password-input').fill('MobileSmokePass!42');
  await page.getByTestId('vault-item-save-button').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('vault-item-save-button')).toBeVisible();
  await page.getByTestId('vault-item-save-button').click();

  await expect(page.getByTestId('vault-list-item').filter({ hasText: 'Mobile Smoke Login' })).toBeVisible();

  await openMobileNavigation(page);
  await page.getByTestId('nav-settings-button').click();
  await expect(page.getByTestId('settings-workspace')).toBeVisible();
  await page.getByTestId('settings-emergency-kit-card').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('settings-emergency-kit-download-button')).toBeVisible();
});
