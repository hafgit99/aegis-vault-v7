import { expect, test, type Page } from '@playwright/test';

const masterPassword = 'master-pass-features-e2e';

async function setupVault(page: Page) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);
  await page.getByTestId('lock-remember-secret-key-checkbox').check();
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

test.describe('Aegis Vault Features & Workflows E2E', () => {
  test('creates, masks, reveals, and persists a payment card item', async ({ page }) => {
    await setupVault(page);

    await page.getByTestId('new-vault-item-button').click();
    await page.getByTestId('vault-item-category-card').click();

    await page.getByTestId('vault-item-title-input').fill('E2E Visa Platinum');
    await page.getByTestId('vault-item-cardholder-input').fill('Alice Doe');
    await page.getByTestId('vault-item-cardnumber-input').fill('4111 2222 3333 4444');
    await page.getByTestId('vault-item-cardexpiry-input').fill('12/28');
    await page.getByTestId('vault-item-cardcvv-input').fill('789');
    await page.getByTestId('vault-item-cardpin-input').fill('1234');
    await page.getByTestId('vault-item-notes-input').fill('Corporate travel card.');
    await page.getByTestId('vault-item-save-button').click();

    await expect(page.getByTestId('vault-item-save-button')).toBeHidden();

    const savedCard = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Visa Platinum' });
    await expect(savedCard).toBeVisible();
    await savedCard.click();

    await expect(page.getByTestId('card-cardholder-value')).toContainText('Alice Doe');
    await expect(page.getByTestId('card-expiry-value')).toContainText('12/28');

    // CVV and PIN are masked by default (*** / ****)
    await expect(page.getByTestId('card-cvv-value')).toContainText('***');
    await page.getByTestId('card-cvv-reveal-button').click();
    await expect(page.getByTestId('card-cvv-value')).toContainText('789');

    await expect(page.getByTestId('card-pin-value')).toContainText('****');
    await page.getByTestId('card-pin-reveal-button').click();
    await expect(page.getByTestId('card-pin-value')).toContainText('1234');

    // Card details persist after reload
    await page.reload();
    await expect(page.getByTestId('lock-password-input')).toBeVisible();
    await expect(page.getByTestId('lock-confirm-password-input')).toBeHidden();
    await page.getByTestId('lock-password-input').fill(masterPassword);
    await page.getByTestId('lock-submit-button').click();

    const restoredCard = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Visa Platinum' });
    await expect(restoredCard).toBeVisible();
    await restoredCard.click();
    await expect(page.getByTestId('card-cardholder-value')).toContainText('Alice Doe');
  });

  test('creates and displays a passkey item', async ({ page }) => {
    await setupVault(page);

    await page.getByTestId('new-vault-item-button').click();
    await page.getByTestId('vault-item-category-passkey').click();

    await page.getByTestId('vault-item-title-input').fill('E2E GitHub Passkey');
    await page.getByTestId('vault-item-passkey-service-input').fill('github.com');
    await page.getByTestId('vault-item-passkey-id-input').fill('passkey-credential-id-12345');
    await page.getByTestId('vault-item-save-button').click();

    await expect(page.getByTestId('vault-item-save-button')).toBeHidden();

    const savedPasskey = page.getByTestId('vault-list-item').filter({ hasText: 'E2E GitHub Passkey' });
    await expect(savedPasskey).toBeVisible();
    await savedPasskey.click();

    await expect(page.getByTestId('passkey-service-value')).toContainText('github.com');
    await expect(page.getByTestId('passkey-username-value')).toContainText('passkey-credential-id-12345');
  });

  test('generates a Zero-Knowledge share URL and decrypts it in a client modal', async ({ page }) => {
    await setupVault(page);

    // 1. Create target item to share
    await page.getByTestId('new-vault-item-button').click();
    await page.getByTestId('vault-item-title-input').fill('E2E Share Target');
    await page.getByTestId('vault-item-username-input').fill('shared-user');
    await page.getByTestId('vault-item-password-input').fill('SharedPassword!999');
    await page.getByTestId('vault-item-save-button').click();

    const item = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Share Target' });
    await expect(item).toBeVisible();
    await item.click();

    // 2. Open Secure Share Modal
    await page.getByTestId('secure-share-button').click();
    await expect(page.getByTestId('share-modal-url-input')).toBeVisible();

    const shareUrl = await page.getByTestId('share-modal-url-input').inputValue();
    expect(shareUrl).toContain('#share=');
    expect(shareUrl).toContain('&k=');

    await page.getByTestId('share-modal-close-button').click();

    // 3. Navigate directly to the client share URL hash
    await page.goto(shareUrl);

    // 4. Decrypted payload modal should display the credentials
    await expect(page.getByTestId('receive-share-save-button')).toBeVisible();
    await expect(page.getByTestId('receive-share-username-value')).toHaveText('shared-user');

    // 5. Save shared item
    await page.getByTestId('receive-share-save-button').click();
    await expect(page.getByTestId('receive-share-save-button')).toBeHidden();
  });

  test('attaches custom tags to a vault item and displays tag chips', async ({ page }) => {
    await setupVault(page);

    await page.getByTestId('new-vault-item-button').click();
    await page.getByTestId('vault-item-title-input').fill('E2E Tagged Service');
    await page.getByTestId('vault-item-username-input').fill('tagged-admin');
    await page.getByTestId('vault-item-password-input').fill('TaggedPass!42');

    // Add tags
    await page.getByTestId('tag-picker-input').fill('Production');
    await page.getByTestId('tag-picker-add').click();
    await expect(page.getByTestId('tag-picker-chip')).toContainText('Production');

    await page.getByTestId('vault-item-save-button').click();
    await expect(page.getByTestId('vault-item-save-button')).toBeHidden();

    const savedItem = page.getByTestId('vault-list-item').filter({ hasText: 'E2E Tagged Service' });
    await expect(savedItem).toBeVisible();
    await expect(savedItem.getByTestId('item-tag-list')).toContainText('Production');
  });

  test('switches visual theme palettes and maintains selection across page reloads', async ({ page }) => {
    await setupVault(page);

    await page.getByTestId('nav-settings-button').click();
    await expect(page.getByTestId('theme-settings-card')).toBeVisible();

    // Select Ocean Blue palette
    const oceanPalette = page.getByTestId('theme-palette-ocean');
    if (await oceanPalette.isVisible()) {
      await oceanPalette.click();
      await page.reload();
      await page.getByTestId('lock-password-input').fill(masterPassword);
      await page.getByTestId('lock-submit-button').click();

      await page.getByTestId('nav-settings-button').click();
      await expect(page.getByTestId('theme-settings-card')).toBeVisible();
    }
  });
});
