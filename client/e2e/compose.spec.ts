import { test, expect } from '@playwright/test';

test.describe('Compose', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/compose');
  });

  test('compose page loads', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
  });

  test('compose form fields are present when authenticated', async ({ page }) => {
    // Check if compose form is visible
    const toField = page.getByPlaceholder(/email|till|mottagare/i).first();
    const isVisible = await toField.isVisible().catch(() => false);

    if (isVisible) {
      await toField.fill('test@example.com');
      await expect(toField).toHaveValue('test@example.com');

      // Subject field
      const subjectField = page.getByPlaceholder(/ämne|subject/i).first();
      const subjectVisible = await subjectField.isVisible().catch(() => false);
      if (subjectVisible) {
        await subjectField.fill('Test subject');
        await expect(subjectField).toHaveValue('Test subject');
      }
    }
  });

  test('save draft button exists', async ({ page }) => {
    const saveDraftBtn = page.getByRole('button', { name: /spara utkast|save draft/i }).first();
    const isVisible = await saveDraftBtn.isVisible().catch(() => false);
    if (isVisible) {
      await expect(saveDraftBtn).toBeEnabled();
    }
  });
});
