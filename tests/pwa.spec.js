const { test, expect } = require('playwright/test');

test('la page expose le manifest, enregistre le service worker et recharge le shell hors ligne', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#search-input')).toBeVisible();

  const pwaInfo = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const registration = await navigator.serviceWorker.ready;

    return {
      manifestHref: manifestLink?.getAttribute('href') || '',
      activeScriptUrl: registration.active?.scriptURL || '',
      scope: registration.scope || ''
    };
  });

  expect(pwaInfo.manifestHref).toBe('manifest.webmanifest');
  expect(pwaInfo.activeScriptUrl).toContain('/sw.js');
  expect(pwaInfo.scope).toContain('/');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.locator('#pwa-status-text')).toContainText('Hors ligne partiel');

  await context.setOffline(true);

  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#pwa-status-text')).toContainText('IA en ligne indisponible');
  } finally {
    await context.setOffline(false);
  }
});

test('le controleur PWA masque le bouton d installation par defaut et gere la mise a jour manuelle', async ({ page }) => {
  await page.goto('/tests/fixtures/pwa-harness.html');

  await page.evaluate(async () => {
    const { createPwaController } = await import('/js/ui/pwa-controller.js');

    window.__promptCalls = 0;
    window.__reloadCalls = 0;
    window.__waitingMessages = [];

    const serviceWorkerListeners = {};
    const fakeServiceWorker = {
      controller: { id: 'active-controller' },
      addEventListener(type, handler) {
        serviceWorkerListeners[type] = handler;
      }
    };

    const registrationListeners = {};
    const fakeRegistration = {
      waiting: null,
      installing: null,
      addEventListener(type, handler) {
        registrationListeners[type] = handler;
      }
    };

    window.__serviceWorkerListeners = serviceWorkerListeners;
    window.__fakeRegistration = fakeRegistration;

    const controller = createPwaController({
      windowObject: window,
      documentObject: document,
      navigatorObject: {
        onLine: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        serviceWorker: fakeServiceWorker
      },
      registerServiceWorker: async () => fakeRegistration,
      reloadPage: () => {
        window.__reloadCalls += 1;
      }
    });

    window.__pwaController = controller;
    await controller.init();
  });

  await expect(page.locator('#pwa-install-btn')).toBeHidden();

  await page.evaluate(() => {
    const promptEvent = new Event('beforeinstallprompt');

    Object.defineProperty(promptEvent, 'prompt', {
      value: () => {
        window.__promptCalls += 1;
        return Promise.resolve();
      }
    });

    Object.defineProperty(promptEvent, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted' })
    });

    window.dispatchEvent(promptEvent);
  });

  await expect(page.locator('#pwa-install-btn')).toBeVisible();
  await expect(page.locator('#pwa-install-btn')).toHaveText('Installer l app');

  await page.locator('#pwa-install-btn').click();
  await expect.poll(() => page.evaluate(() => window.__promptCalls)).toBe(1);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });

  await expect(page.locator('#pwa-install-btn')).toBeHidden();

  await page.evaluate(() => {
    window.__fakeRegistration.waiting = {
      postMessage(message) {
        window.__waitingMessages.push(message);
      }
    };

    window.__pwaController.showUpdateReady(window.__fakeRegistration);
  });

  await expect(page.locator('#pwa-update-btn')).toBeVisible();
  await expect(page.locator('#pwa-status-text')).toContainText('Mise a jour disponible');

  await page.locator('#pwa-update-btn').click();
  await expect.poll(() => page.evaluate(() => window.__waitingMessages.slice())).toEqual([
    { type: 'SKIP_WAITING' }
  ]);

  await page.evaluate(() => {
    window.__serviceWorkerListeners.controllerchange();
  });

  await expect.poll(() => page.evaluate(() => window.__reloadCalls)).toBe(1);
});
