import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('login page loads with Georgian text', async ({ page }) => {
    await page.goto('/ka/login');
    await expect(page).toHaveTitle(/შესვლა/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/ka/register');
    await expect(page).toHaveTitle(/რეგისტრაცია/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/ka/login');

    await page.fill('input[type="email"], input[name="email"]', 'nonexistent@test.com');
    await page.fill('input[type="password"], input[name="password"]', 'WrongPass123');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('[role="alert"], .error, [class*="error"]').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('language switch from ka to en updates URL', async ({ page }) => {
    await page.goto('/ka/login');
    expect(page.url()).toContain('/ka/');

    // Find and click English language button
    const engButton = page.locator('button:has-text("Eng")');
    if (await engButton.isVisible()) {
      await engButton.click();
      await page.waitForURL('**/en/**');
      expect(page.url()).toContain('/en/');
    }
  });
});
