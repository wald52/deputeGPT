const { test, expect } = require('playwright/test');

test('le chargement initial utilise l artefact leger et laisse l hemicycle a la demande', async ({ page }) => {
  const requestedUrls = [];

  page.on('requestfinished', request => {
    requestedUrls.push(request.url());
  });

  await page.goto('/');
  await expect(page.locator('#search-input')).toBeVisible();
  await expect.poll(
    () => requestedUrls.some(url => url.includes('/public/data/deputes_actifs/latest.json'))
  ).toBeTruthy();
  await expect.poll(
    () => requestedUrls.some(url => /\/public\/data\/deputes_actifs\/boot-v\d{4}-\d{2}-\d{2}\.json/.test(url))
  ).toBeTruthy();

  expect(
    requestedUrls.some(url => /\/public\/data\/deputes_actifs\/v\d{4}-\d{2}-\d{2}\.json$/.test(url))
  ).toBeFalsy();
  expect(
    requestedUrls.some(url => url.includes('/public/data/hemicycle_svg/hemicycle.svg'))
  ).toBeFalsy();
  expect(
    requestedUrls.some(url => url.includes('/public/data/rag/manifest.json'))
  ).toBeFalsy();

  await page.locator('#search-input').fill('David');
  await expect(page.locator('#search-results .search-result-button').first()).toBeVisible();
  await page.locator('#search-input').press('Escape');

  await Promise.all([
    page.waitForResponse(response => response.url().includes('/public/data/hemicycle_svg/hemicycle.svg')),
    page.locator('[data-load-hemicycle]').click()
  ]);
});
