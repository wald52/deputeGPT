import { describe, it, expect } from 'vitest';
import { createDeterministicRouteExecutor } from './deterministic-responses.js';
import { THEME_KEYWORDS } from './router-constants.js';
import { normalizeQuestion } from './vote-normalizer.js';

const DEPUTE = {
  prenom: 'Didier',
  nom: 'Lemaire',
  votes: []
};

const VOTES_FIN_DE_VIE = [
  { numero: '7894', date: '2026-06-30', titre: "l'ensemble de la proposition de loi relative au droit à l'aide à mourir (nouvelle lecture)", vote: 'Pour', sort: 'adopté' },
  { numero: '7520', date: '2026-06-24', titre: "l'amendement n° 800 de Mme Rousseau à l'article 4 de la proposition de loi relative au droit à l'aide à mourir (nouvelle lecture)", vote: 'Contre', sort: 'rejeté' },
  { numero: '7521', date: '2026-06-24', titre: "l'amendement n° 1107 de Mme Simonnet à l'article 4 de la proposition de loi relative au droit à l'aide à mourir (nouvelle lecture)", vote: 'Contre', sort: 'rejeté' },
  { numero: '7519', date: '2026-06-24', titre: "l'amendement n° 1156 de M. Lenoir à l'article 4 de la proposition de loi relative au droit à l'aide à mourir (nouvelle lecture)", vote: 'Abstention', sort: 'rejeté' }
];

const FICHE_AIDE_A_MOURIR = {
  dossierId: 'DLR5L17N9',
  titre: "Proposition de loi relative au droit à l'aide à mourir",
  verdictIncitations: 'incitations_alignees',
  objectifAffiche: "Créer un droit à l'aide à mourir strictement encadré.",
  justificationVerdict: 'Les articles créent le droit annoncé.',
  mecanismesCles: [],
  disclaimer: 'Analyse générée automatiquement par IA.'
};

function createExecutor({ ficheByVote = {} } = {}) {
  return createDeterministicRouteExecutor({
    resolveScopeVotes: (scope, votes) => votes,
    applyScopeFilters: votes => votes,
    detectClosedVoteQuestion: () => false,
    findGlobalVotesByQuery: () => [],
    getVoteId: vote => String(vote.numero),
    normalizeQuestion,
    defaultChatListLimit: 12,
    thematicStanceExampleLimit: 4,
    themeKeywords: THEME_KEYWORDS,
    formatVoteLine: vote => `- [${vote.date}] ${vote.vote} - ${vote.titre}`,
    getFicheForVote: async numero => ficheByVote[String(numero)] || null
  });
}

function buildStanceRoute(theme) {
  return {
    intent: { kind: 'thematic_stance', confidence: 1, signals: ['thematic_stance'], reason: null },
    plan: { questionType: 'thematic_stance', candidateStrategy: 'structured_filters', requiresLlm: false, responseMode: 'deterministic', unsupportedReason: null },
    scope: {
      source: 'explicit_filter',
      voteIds: null,
      isFollowUp: false,
      filters: { theme, vote: null, queryText: null, dateFrom: null, dateTo: null, limit: null, sort: 'date_desc' }
    }
  };
}

describe('executeDeterministicRoute - thematic_stance (semantique corrigee)', () => {
  it('priorise les votes sur l ensemble du texte et ne conclut plus du tally', async () => {
    const executor = createExecutor();
    const depute = { ...DEPUTE, votes: VOTES_FIN_DE_VIE };
    const result = await executor(buildStanceRoute('fin de vie'), "Est-ce que ce député est pour l'euthanasie ?", depute);

    expect(result.kind).toBe('response');
    expect(result.message).toContain("l'ensemble des textes");
    expect(result.displayedVoteIds).toEqual(['7894']);
    expect(result.message).toContain('amendements ne sont pas interprétables');
    expect(result.message).not.toContain('position plutôt');
    expect(result.message).not.toContain('suggère une position');
  });

  it('croise le vote ensemble avec la fiche de loi quand elle existe', async () => {
    const executor = createExecutor({ ficheByVote: { 7894: FICHE_AIDE_A_MOURIR } });
    const depute = { ...DEPUTE, votes: VOTES_FIN_DE_VIE };
    const result = await executor(buildStanceRoute('fin de vie'), "Est-ce que ce député est pour l'euthanasie ?", depute);

    expect(result.message).toContain('Objectif affiché');
    expect(result.message).toContain('Incitations alignées');
    expect(result.message).toContain('générées par IA');
  });

  it('signale honnetement un terme precis introuvable dans le theme', async () => {
    const executor = createExecutor();
    const depute = { ...DEPUTE, votes: VOTES_FIN_DE_VIE };
    const result = await executor(buildStanceRoute('logement'), "Est-ce que ce député est pour l'isolation des bâtiments ?", depute);

    expect(result.message).toContain('Aucun scrutin ne mentionne « isolation »');
  });

  it('restreint aux scrutins mentionnant le terme precis quand il existe', async () => {
    const votes = [
      ...VOTES_FIN_DE_VIE,
      { numero: '9001', date: '2026-01-10', titre: "l'ensemble de la proposition de loi sur l'isolation thermique des bâtiments", vote: 'Pour', sort: 'adopté' }
    ];
    const executor = createExecutor();
    const depute = { ...DEPUTE, votes };
    const result = await executor(buildStanceRoute('logement'), "Est-ce que ce député est pour l'isolation des bâtiments ?", depute);

    expect(result.message).toContain('mentionnant « isolation »');
    expect(result.displayedVoteIds).toEqual(['9001']);
  });

  it('explique l absence de vote sur l ensemble d un texte', async () => {
    const executor = createExecutor();
    const depute = { ...DEPUTE, votes: VOTES_FIN_DE_VIE.slice(1) };
    const result = await executor(buildStanceRoute('fin de vie'), 'Est-il pour la fin de vie ?', depute);

    expect(result.message).toContain("aucun vote sur l'ensemble d'un texte");
  });
});
