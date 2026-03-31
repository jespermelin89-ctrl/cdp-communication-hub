import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('inbox page loads', async ({ page }) => {
    await page.goto('/inbox');
    // Should show inbox heading or redirect to login
    const heading = page.getByRole('heading', { name: /inkorg/i });
    const loginBtn = page.getByText(/google|logga in|sign in/i).first();
    const hasHeading = await heading.isVisible().catch(() => false);
    const hasLogin = await loginBtn.isVisible().catch(() => false);
    expect(hasHeading || hasLogin).toBe(true);
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/settings/);
    // Page should at minimum render without crashing
    await expect(page.locator('body')).toBeVisible();
  });

  test('contacts page loads', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page).toHaveURL(/contacts/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('drafts page loads', async ({ page }) => {
    await page.goto('/drafts');
    await expect(page).toHaveURL(/drafts/);
    await expect(page.locator('body')).toBeVisible();
  });
});
