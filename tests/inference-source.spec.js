const { test, expect } = require('playwright/test');

test('la source IA online reste memorisee au rechargement', async ({ page }) => {
  await page.goto('/');

  const sourceSelect = page.locator('#ai-source-select');
  await expect(page.locator('#model-settings-summary')).toContainText('IA en ligne');
  await expect(sourceSelect).toHaveValue('online');

  await page.getByRole('button', { name: 'Réglages IA' }).click();
  await expect(page.locator('#advanced-options')).toBeVisible();
  await sourceSelect.selectOption('local');
  await expect(sourceSelect).toHaveValue('local');

  await sourceSelect.selectOption('online');
  await expect(sourceSelect).toHaveValue('online');

  await page.reload();
  await expect(sourceSelect).toHaveValue('online');
});
