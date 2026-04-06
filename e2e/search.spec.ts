import { test, expect } from '@playwright/test';

test.describe('Search Page', () => {
  test('search page loads', async ({ page }) => {
    await page.goto('/ka/search');
    await expect(page).toHaveTitle(/ძებნა/);
  });

  test('home page loads with hero section', async ({ page }) => {
    await page.goto('/ka');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('a[href*="/search"], button:has-text("დაიწყე")').first()).toBeVisible();
  });

  test('navbar is visible with correct links', async ({ page }) => {
    await page.goto('/ka');
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a:has-text("ძებნა")')).toBeVisible();
    await expect(nav.locator('a:has-text("ატვირთვა")')).toBeVisible();
  });
});
