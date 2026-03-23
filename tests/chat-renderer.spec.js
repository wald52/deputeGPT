const { test, expect } = require('playwright/test');

async function mountRenderer(page, options = {}) {
  await page.goto('/tests/fixtures/chat-renderer-harness.html');

  await page.evaluate(async ({ appState = { isChatBusy: false } } = {}) => {
    const { createChatRenderer } = await import('/js/ui/chat/chat-renderer.js');

    window.__submittedQuestions = [];
    window.__paginationCalls = [];
    window.__openedSources = [];
    window.__persistedMessages = [];
    window.__appState = appState;

    const renderer = createChatRenderer({
      appState: window.__appState,
      defaultChatListLimit: 2,
      formatChatTime: () => '10:00',
      buildMessageReferencesFromVoteIds: () => [],
      submitChatQuestion: question => {
        window.__submittedQuestions.push(question);
        return true;
      },
      openVoteSourceModal: payload => {
        window.__openedSources.push(payload);
        return true;
      },
      resolvePaginationOffset: metadata => Array.isArray(metadata?.displayedVoteIds) ? metadata.displayedVoteIds.length : 0,
      handlePaginationRequest: async metadata => {
        window.__paginationCalls.push(metadata);
        return true;
      },
      updateChatEmptyState: () => {},
      persistMessage: async payload => {
        window.__persistedMessages.push(payload);
      }
    });

    window.__renderer = renderer;
  }, options);
}

test('le renderer affiche une liste inline sans bloc References et resynchronise les actions', async ({ page }) => {
  await mountRenderer(page, { appState: { isChatBusy: true } });

  await page.evaluate(async () => {
    await window.__renderer.renderAssistantMessage(
      document.getElementById('messages'),
      null,
      "Texte complet qui ne doit pas etre persiste tel quel",
      {
        method: 'deterministic',
        metadata: {
          method: 'deterministic',
          referencePresentation: 'inline_rows',
          summaryText: 'Jean Dupont a 3 votes correspondants.\nJ en affiche 2, tries par date.',
          inlineVoteMode: 'list',
          inlineVoteItems: [
            {
              voteId: '101',
              lineText: '[2025-02-01] Pour - Amendement test',
              date: '2025-02-01',
              theme: 'sante',
              sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/101',
              modalTitle: 'Amendement test'
            },
            {
              voteId: '102',
              lineText: '[2025-02-02] Contre - Article 3',
              date: '2025-02-02',
              theme: '',
              sourceUrl: '',
              modalTitle: 'Article 3'
            }
          ],
          allVoteIds: ['101', '102', '103'],
          displayedVoteIds: ['101', '102'],
          pageSize: 2
        }
      }
    );
  });

  await expect(page.locator('.message-inline-vote-item')).toHaveCount(2);
  await expect(page.locator('.message-references')).toHaveCount(0);
  await expect(page.locator('.message-content')).toContainText('Jean Dupont a 3 votes correspondants.');
  await expect(page.locator('.message-inline-vote-item').first()).toContainText('Pour - Amendement test');
  await expect(page.locator('.message-inline-vote-item').first()).toContainText('scrutin 101');
  await expect(page.locator('.message-inline-vote-item').first()).toContainText('Theme: sante');

  const firstSourceButton = page.locator('.message-inline-vote-item').first().getByRole('button', { name: "Voir dans l'app" });
  const paginationButton = page.getByRole('button', { name: 'Afficher 1 de plus' });

  await expect(firstSourceButton).toBeDisabled();
  await expect(paginationButton).toBeDisabled();
  await expect(page.locator('.message-inline-vote-item').nth(1).getByRole('button', { name: "Voir dans l'app" })).toHaveCount(0);

  await page.evaluate(() => {
    window.__appState.isChatBusy = false;
    window.__renderer.syncInteractiveMessageStates();
  });

  await expect(firstSourceButton).toBeEnabled();
  await expect(paginationButton).toBeEnabled();

  await firstSourceButton.click();
  await expect.poll(() => page.evaluate(() => window.__openedSources.slice())).toEqual([
    {
      title: 'Amendement test',
      voteId: '101',
      date: '2025-02-01',
      sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/101'
    }
  ]);

  await paginationButton.click();
  await expect.poll(() => page.evaluate(() => window.__paginationCalls.length)).toBe(1);

  await expect.poll(() => page.evaluate(() => window.__persistedMessages[0]?.content || '')).toBe(
    'Jean Dupont a 3 votes correspondants.\nJ en affiche 2, tries par date.'
  );
});

test('addMessage rehydrate correctement un message inline depuis des metadonnees sauvegardees', async ({ page }) => {
  await mountRenderer(page);

  await page.evaluate(async () => {
    await window.__renderer.addMessage('ai', 'Ancien contenu brut', {
      method: 'deterministic',
      saveToHistory: false,
      metadata: {
        method: 'deterministic',
        referencePresentation: 'inline_rows',
        summaryText: 'Resume restaure',
        inlineVoteMode: 'subjects',
        inlineVoteItems: [
          {
            voteId: '201',
            lineText: '[2025-03-01] Proposition de loi test (Pour)',
            date: '2025-03-01',
            theme: 'budget',
            sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/201',
            modalTitle: 'Proposition de loi test'
          }
        ],
        displayedVoteIds: ['201'],
        allVoteIds: ['201'],
        pageSize: 1
      }
    });
  });

  await expect(page.locator('.message-content')).toHaveText('Resume restaure');
  await expect(page.locator('.message-inline-vote-item')).toHaveCount(1);
  await expect(page.locator('.message-inline-vote-item')).toContainText('Proposition de loi test');
  await expect(page.locator('.message-inline-vote-item')).toContainText('scrutin 201');
  await expect(page.locator('.message-references')).toHaveCount(0);
});

test('les analyses conservent un panneau de references separe', async ({ page }) => {
  await mountRenderer(page);

  await page.evaluate(async () => {
    await window.__renderer.renderAssistantMessage(
      document.getElementById('messages'),
      null,
      'Analyse de test',
      {
        method: 'analysis_rag',
        metadata: {
          method: 'analysis_rag',
          references: [
            {
              voteId: '301',
              title: 'Amendement analyse',
              sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/301',
              date: '2025-02-01'
            }
          ]
        }
      }
    );
  });

  await expect(page.locator('.message-references')).toHaveCount(1);
  await expect(page.locator('.message-references-title')).toHaveText('Votes cites dans l analyse');
  await expect(page.locator('.message-inline-vote-item')).toHaveCount(0);
});
