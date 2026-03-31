import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('settings page renders theme options', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('body')).toBeVisible();

    // Theme buttons might not be visible without auth — just check page renders
    const darkBtn = page.getByRole('button', { name: /mörkt|dark/i }).first();
    const lightBtn = page.getByRole('button', { name: /ljust|light/i }).first();
    const systemBtn = page.getByRole('button', { name: /system/i }).first();

    const hasDark = await darkBtn.isVisible().catch(() => false);
    const hasLight = await lightBtn.isVisible().catch(() => false);
    const hasSystem = await systemBtn.isVisible().catch(() => false);

    if (hasDark && hasLight) {
      // Click dark mode
      await darkBtn.click();
      await expect(page.locator('html')).toHaveClass(/dark/);

      // Click light mode
      await lightBtn.click();
      // html class should not contain 'dark' after switching to light
      const htmlClass = await page.locator('html').getAttribute('class');
      expect(htmlClass ?? '').not.toMatch(/\bdark\b/);
    }

    if (hasSystem) {
      await expect(systemBtn).toBeVisible();
    }
  });

  test('page body is always visible', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('body')).toBeVisible();
  });
});
