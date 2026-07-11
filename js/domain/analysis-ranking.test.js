import { describe, it, expect, vi } from 'vitest';
import { createAnalysisRankingHelpers } from './analysis-ranking.js';

const VOTES = [
  { id: 'v1', titre: 'Budget agriculture', subject: 'Credits agricoles', date: '2026-01-10' },
  { id: 'v2', titre: 'Loi energie', subject: 'Souverainete energetique', date: '2026-02-10' },
  { id: 'v3', titre: 'Motion de censure', subject: 'Gouvernement', date: '2026-03-10' }
];

function createHelpers(overrides = {}) {
  return createAnalysisRankingHelpers({
    normalizeQuestion: value => String(value || '').toLowerCase(),
    analysisStopwords: new Set(),
    themeKeywords: {},
    hasLexicalSearchReady: () => false,
    searchVotesInIndex: () => [],
    analysisSearchResultLimit: 80,
    isSemanticRagEnabled: () => false,
    isSemanticRagReady: () => false,
    buildSemanticScores: null,
    isRemoteRerankAvailable: () => false,
    buildRemoteRerankScores: null,
    getVoteId: vote => vote.id,
    lookupVoteIndexText: vote => `${vote.titre} ${vote.subject}`.toLowerCase(),
    lookupVoteSubject: vote => vote.subject || '',
    lookupVoteThemeLabel: vote => vote.theme || '',
    ...overrides
  });
}

describe('rankVotesForAnalysis — rerank distant', () => {
  it('applique les scores du rerank distant au classement', async () => {
    const buildRemoteRerankScores = vi.fn(async () => new Map([['v1', 0.95], ['v3', 0.10]]));
    const helpers = createHelpers({
      isRemoteRerankAvailable: () => true,
      buildRemoteRerankScores
    });

    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'question analytique', {});

    expect(buildRemoteRerankScores).toHaveBeenCalledOnce();
    expect(ranked[0].id).toBe('v1');
  });

  it('remplace le score semantique local quand le rerank distant repond', async () => {
    const buildSemanticScores = vi.fn(async () => new Map([['v2', 1]]));
    const helpers = createHelpers({
      isRemoteRerankAvailable: () => true,
      buildRemoteRerankScores: async () => new Map([['v1', 0.9]]),
      isSemanticRagEnabled: () => true,
      isSemanticRagReady: () => true,
      buildSemanticScores
    });

    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'question', {});

    expect(buildSemanticScores).not.toHaveBeenCalled();
    expect(ranked[0].id).toBe('v1');
  });

  it('retombe sur le semantique local quand le rerank distant renvoie null', async () => {
    const buildSemanticScores = vi.fn(async () => new Map([['v2', 1]]));
    const helpers = createHelpers({
      isRemoteRerankAvailable: () => true,
      buildRemoteRerankScores: async () => null,
      isSemanticRagEnabled: () => true,
      isSemanticRagReady: () => true,
      buildSemanticScores
    });

    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'question', {});

    expect(buildSemanticScores).toHaveBeenCalledOnce();
    expect(ranked[0].id).toBe('v2');
  });

  it('ne propage jamais une erreur du rerank distant', async () => {
    const helpers = createHelpers({
      isRemoteRerankAvailable: () => true,
      buildRemoteRerankScores: async () => {
        throw new Error('reseau coupe');
      }
    });

    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'question', {});
    // Sans aucun signal, l'ordre retombe sur la recence.
    expect(ranked.map(vote => vote.id)).toEqual(['v3', 'v2', 'v1']);
  });

  it('ne propage jamais une erreur du semantique local', async () => {
    const helpers = createHelpers({
      isSemanticRagEnabled: () => true,
      isSemanticRagReady: () => true,
      buildSemanticScores: async () => {
        throw new Error('encodeur indisponible');
      }
    });

    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'question', {});
    expect(ranked.map(vote => vote.id)).toEqual(['v3', 'v2', 'v1']);
  });

  it('sans aucun signal distant ni local, le classement lexical est inchange', async () => {
    const helpers = createHelpers();
    const ranked = await helpers.rankVotesForAnalysis(VOTES, 'budget agriculture', {});
    // "budget" et "agriculture" matchent le titre de v1 (+7 chacun).
    expect(ranked[0].id).toBe('v1');
  });
});
