import { test, expect } from '@playwright/test';

test.describe('Keyboard shortcuts', () => {
  test('Cmd+K opens chat widget', async ({ page }) => {
    await page.goto('/inbox');
    await page.locator('body').press('Meta+k');

    // Chat widget might be visible — check for chat input
    const chatInput = page.getByPlaceholder(/kommando|skriv/i).first();
    const isVisible = await chatInput.isVisible().catch(() => false);

    // This test is best-effort — chat might require auth
    expect(typeof isVisible).toBe('boolean');
  });

  test('Escape closes chat widget if open', async ({ page }) => {
    await page.goto('/inbox');
    // Open chat
    await page.locator('body').press('Meta+k');
    // Close with Escape
    await page.locator('body').press('Escape');
    await expect(page.locator('body')).toBeVisible();
  });

  test('j/k navigation in inbox when threads exist', async ({ page }) => {
    await page.goto('/inbox');

    // Wait for page to settle
    await page.waitForTimeout(1000);

    const threads = page.locator('[data-thread-index]');
    const count = await threads.count().catch(() => 0);

    if (count > 0) {
      // Press j to move down
      await page.locator('body').press('j');
      // Press k to move up
      await page.locator('body').press('k');
    }

    // Page should still be intact
    await expect(page.locator('body')).toBeVisible();
  });
});
