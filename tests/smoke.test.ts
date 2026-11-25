import { test, expect } from '@playwright/test';

test('home page loads and shows surah list', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Kalamalah/);
  // Check surah cards are rendered
  await expect(page.locator('.surah-card')).toHaveCount(114);
});

test('reciters page loads and shows reciters', async ({ page }) => {
  await page.goto('/reciters');
  await expect(page.locator('h1')).toContainText('Reciters');
});

test('surah page loads and shows ayahs', async ({ page }) => {
  await page.goto('/surah-1');
  await expect(page.locator('h1')).toContainText('Al-Fatihah');
  // Check ayah elements are rendered
  await expect(page.locator('.quran-word').first()).toBeVisible();
});

test('soft navigation does not break', async ({ page }) => {
  await page.goto('/');
  // Click on a surah
  await page.locator('a[href="/surah-2"]').click();
  await expect(page).toHaveURL(/\/surah-2/);
  // Click back to home
  await page.locator('a[href="/"]').click();
  await expect(page).toHaveURL('/');
  // Surah list should still be visible
  await expect(page.locator('.surah-card').first()).toBeVisible();
});
