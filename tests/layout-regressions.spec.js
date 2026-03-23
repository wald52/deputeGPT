const { test, expect } = require('playwright/test');

async function ensureDeferredAppCssLoaded(page) {
  await page.keyboard.press('Escape');
  await expect.poll(async () => page.evaluate(() => (
    Array.from(document.styleSheets).some(sheet => String(sheet.href || '').includes('/public/styles/app.css'))
  ))).toBeTruthy();
}

async function seedDesktopChatStressState(page, messageCount) {
  await page.evaluate((messageCount) => {
    const placeholder = document.querySelector('#depute-placeholder');
    const content = document.querySelector('#depute-content');
    const selected = document.querySelector('#selected-depute');

    if (placeholder) placeholder.hidden = true;
    if (content) {
      content.hidden = false;
      selected?.classList.add('active');

      const img = document.querySelector('#depute-img');
      const name = document.querySelector('#depute-name');
      const details = document.querySelector('#depute-details');
      const stats = document.querySelector('#stats-container');
      const statVotes = document.querySelector('#stat-votes');

      if (img) img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      if (name) name.textContent = 'Frederic Weber';
      if (details) details.textContent = 'Rassemblement National | Siege 118 | Meurthe-et-Moselle (3e circonscription)';
      if (stats) stats.hidden = false;
      if (statVotes) statVotes.textContent = '2608';
    }

    const quickActions = document.querySelector('#chat-quick-actions');
    quickActions.innerHTML = `
      <button class="chat-quick-action">Vote recent</button>
      <button class="chat-quick-action">Derniers votes</button>
      <button class="chat-quick-action">Synthese</button>
    `;

    const scopeSummary = document.querySelector('#chat-scope-summary');
    scopeSummary.classList.remove('hidden');
    scopeSummary.innerHTML = `
      <span class="chat-scope-chip"><strong>Depute:</strong> <span class="chat-scope-chip-value">Frederic Weber</span></span>
      <span class="chat-scope-chip"><strong>Perimetre:</strong> <span class="chat-scope-chip-value">sous-ensemble filtre, 1 vote</span></span>
      <span class="chat-scope-chip"><strong>Cible:</strong> <span class="chat-scope-chip-value">amendement n° 479</span></span>
      <span class="chat-scope-chip"><strong>Tri:</strong> <span class="chat-scope-chip-value">date decroissante</span></span>
      <span class="chat-scope-chip"><strong>Limite:</strong> <span class="chat-scope-chip-value">12</span></span>
      <span class="chat-scope-chip chat-scope-chip-multiline"><strong>Derniere demande:</strong> <span class="chat-scope-chip-value">montre le vote sur l'amendement n° 479 de M. Labaronne de suppression de l'article 1er ter</span></span>
    `;

    const scopeActions = document.querySelector('#chat-scope-actions');
    scopeActions.classList.remove('hidden');
    scopeActions.innerHTML = `
      <button class="chat-scope-action-btn">Voir ce vote</button>
      <button class="chat-scope-action-btn">Source officielle</button>
    `;

    const messages = document.querySelector('#messages');
    messages.innerHTML = '';

    for (let index = 0; index < messageCount; index += 1) {
      const message = document.createElement('article');
      message.className = `message ${index % 2 === 0 ? 'ai' : 'user'}`;
      message.innerHTML = `
        <div class="message-content">${`Message ${index + 1} - contenu de demonstration pour remplir le chat. `.repeat(index % 3 === 0 ? 3 : 1)}</div>
        <div class="message-meta">22:36</div>
      `;
      messages.appendChild(message);
    }
  }, messageCount);

  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
}

async function measureDesktopChatBlocks(page) {
  return await page.evaluate(() => {
    const height = (selector) => {
      const element = document.querySelector(selector);
      return element ? Math.round(element.getBoundingClientRect().height) : 0;
    };

    const top = (selector) => {
      const element = document.querySelector(selector);
      return element ? Math.round(element.getBoundingClientRect().top) : 0;
    };

    return {
      header: height('header'),
      footer: height('footer'),
      chatPanelTop: top('#chat-panel'),
      toolbar: height('.model-toolbar-shell'),
      deputeCard: height('.depute-card'),
      quickActions: height('#chat-quick-actions'),
      quickActionButton: height('.chat-quick-action'),
      scopeSummary: height('#chat-scope-summary'),
      scopeActions: height('#chat-scope-actions'),
      scopeActionButton: height('.chat-scope-action-btn'),
      inputArea: height('.input-area')
    };
  });
}

test('les overlays restent masques avant le chargement differe de app.css', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-input')).toBeVisible();

  expect(await page.evaluate(
    () => document.querySelector('link[data-deferred-asset="app-css"]') === null
  )).toBeTruthy();

  await expect(page.locator('#model-consent-overlay')).toBeHidden();
  await expect(page.locator('#vote-source-overlay')).toBeHidden();
  await expect(page.locator('#model-consent-overlay .consent-dialog')).toBeHidden();
  await expect(page.locator('#vote-source-overlay .vote-source-dialog')).toBeHidden();
});

test('le layout mobile reste mono-colonne a 390px sans debordement horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.mobile-workspace-switcher')).toBeVisible();

  await ensureDeferredAppCssLoaded(page);

  const layout = await page.evaluate(() => {
    const main = document.querySelector('.main-content');
    const activePanel = document.querySelector('body[data-mobile-view] .panel:not([hidden])');

    return {
      gridTemplateColumns: getComputedStyle(main).gridTemplateColumns,
      mainClientWidth: main.clientWidth,
      mainScrollWidth: main.scrollWidth,
      activePanelWidth: activePanel?.getBoundingClientRect().width ?? 0,
      bodyScrollWidth: document.body.scrollWidth,
      docClientWidth: document.documentElement.clientWidth
    };
  });

  expect(layout.gridTemplateColumns.split(/\s+/).filter(Boolean)).toHaveLength(1);
  expect(layout.mainScrollWidth).toBeLessThanOrEqual(layout.mainClientWidth + 1);
  expect(layout.activePanelWidth).toBeLessThanOrEqual(layout.mainClientWidth + 2);
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.docClientWidth + 1);
});

test('les blocs superieurs du chat ne rapetissent pas quand la conversation s allonge sur desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 922 });
  await page.goto('/');
  await expect(page.locator('#chat-panel')).toBeVisible();

  await ensureDeferredAppCssLoaded(page);

  await seedDesktopChatStressState(page, 2);
  const baseline = await measureDesktopChatBlocks(page);

  await seedDesktopChatStressState(page, 24);
  const stressed = await measureDesktopChatBlocks(page);

  expect(stressed.header).toBeGreaterThanOrEqual(baseline.header - 1);
  expect(stressed.footer).toBeGreaterThanOrEqual(baseline.footer - 1);
  expect(Math.abs(stressed.chatPanelTop - baseline.chatPanelTop)).toBeLessThanOrEqual(1);
  expect(stressed.toolbar).toBeGreaterThanOrEqual(baseline.toolbar - 1);
  expect(stressed.deputeCard).toBeGreaterThanOrEqual(baseline.deputeCard - 1);
  expect(stressed.quickActions).toBeGreaterThanOrEqual(baseline.quickActions - 1);
  expect(stressed.scopeSummary).toBeGreaterThanOrEqual(baseline.scopeSummary - 1);
  expect(stressed.scopeActions).toBeGreaterThanOrEqual(baseline.scopeActions - 1);
  expect(stressed.inputArea).toBeGreaterThanOrEqual(baseline.inputArea - 1);
  expect(stressed.quickActions).toBeGreaterThanOrEqual(stressed.quickActionButton - 1);
  expect(stressed.scopeActions).toBeGreaterThanOrEqual(stressed.scopeActionButton - 1);
});
