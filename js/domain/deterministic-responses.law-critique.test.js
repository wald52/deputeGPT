import { describe, it, expect } from 'vitest';
import { createDeterministicRouteExecutor } from './deterministic-responses.js';

const DEPUTE = {
  prenom: 'Jean',
  nom: 'Martin',
  votes: [
    { numero: '100', date: '2025-11-10', titre: 'PLF 2026', vote: 'Pour', sort: 'adopté' },
    { numero: '200', date: '2025-05-02', titre: 'Souveraineté énergétique', vote: 'Contre', sort: 'adopté' }
  ]
};

const FICHE = {
  dossierId: 'DLR5L17N2',
  titre: 'Proposition de loi souveraineté énergétique',
  verdictIncitations: 'incitations_opposees',
  objectifAffiche: 'Réduire les émissions.',
  justificationVerdict: 'L article 3 subventionne des énergies fossiles.',
  mecanismesCles: [{ resume: 'Subvention aux énergies fossiles', articleRef: 'art. 3', citation: null }],
  sources: { dossierAn: 'https://an.fr/dossier', texteAn: 'https://an.fr/texte' },
  disclaimer: 'Analyse générée automatiquement par IA.'
};

function createExecutor({ dossierMatch = null, fiche = null } = {}) {
  return createDeterministicRouteExecutor({
    resolveScopeVotes: (scope, votes) => votes,
    applyScopeFilters: votes => votes,
    detectClosedVoteQuestion: () => false,
    findGlobalVotesByQuery: () => [],
    getVoteId: vote => String(vote.numero),
    defaultChatListLimit: 12,
    findDossierByQuery: async () => dossierMatch,
    loadDossierFiche: async () => fiche
  });
}

function buildRoute(queryText) {
  return {
    intent: { kind: 'law_critique', confidence: 1, signals: ['law_critique'], reason: null },
    plan: { questionType: 'law_critique', candidateStrategy: 'law_critique_lookup', requiresLlm: false, responseMode: 'deterministic', unsupportedReason: null },
    scope: {
      source: 'depute_all',
      voteIds: null,
      isFollowUp: false,
      filters: { theme: null, vote: null, queryText, dateFrom: null, dateTo: null, limit: null, sort: 'date_desc' }
    }
  };
}

describe('executeDeterministicRoute - law_critique', () => {
  it('rend le verdict, la justification et le disclaimer quand la fiche existe', async () => {
    const executor = createExecutor({
      dossierMatch: {
        dossierId: 'DLR5L17N2',
        confidence: 0.9,
        dossier: { titre: FICHE.titre, anUrl: 'https://an.fr/dossier', scrutinNumeros: ['200'] }
      },
      fiche: FICHE
    });

    const result = await executor(buildRoute('loi souveraineté énergétique'), 'Cette loi est-elle vraiment bonne pour le climat ?', DEPUTE);
    expect(result.kind).toBe('response');
    expect(result.message).toContain('Incitations opposées');
    expect(result.message).toContain('Objectif affiché');
    expect(result.message).toContain('art. 3');
    expect(result.message).toContain('Analyse générée automatiquement par IA');
    expect(result.displayedVoteIds).toEqual(['200']);
    expect(result.lawCritique.verdictIncitations).toBe('incitations_opposees');
  });

  it('explique l absence de fiche mais liste les votes quand le dossier est identifie', async () => {
    const executor = createExecutor({
      dossierMatch: {
        dossierId: 'DLR5L17N1',
        confidence: 0.95,
        dossier: { titre: 'PLF 2026', anUrl: 'https://an.fr/plf', scrutinNumeros: ['100'] }
      },
      fiche: null
    });

    const result = await executor(buildRoute('projet de loi de finances pour 2026'), 'Le PLF est-il vraiment bon pour les ménages ?', DEPUTE);
    expect(result.kind).toBe('response');
    expect(result.message).toContain("fiche d'analyse n'est pas encore disponible");
    expect(result.displayedVoteIds).toEqual(['100']);
    expect(result.lawCritique.hasFiche).toBe(false);
  });

  it('demande une precision quand ni dossier ni vote ne correspondent', async () => {
    const executor = createDeterministicRouteExecutor({
      resolveScopeVotes: () => [],
      applyScopeFilters: () => [],
      detectClosedVoteQuestion: () => false,
      findGlobalVotesByQuery: () => [],
      getVoteId: vote => String(vote.numero),
      defaultChatListLimit: 12,
      findDossierByQuery: async () => null,
      loadDossierFiche: async () => null
    });

    const result = await executor(buildRoute('loi inexistante xyz'), 'La loi inexistante xyz est-elle vraiment utile ?', { ...DEPUTE, votes: [] });
    expect(result.kind).toBe('clarify');
    expect(result.message).toContain("pas identifié le texte de loi");
  });
});
