import { describe, it, expect } from 'vitest';
import {
  buildSemanticInterpreterPrompt,
  parseSemanticInterpretation,
  resolveSemanticInterpretation,
  SEMANTIC_INTERPRETER_MAX_QUESTIONS
} from './semantic-interpreter.js';
import { routeQuestion } from './router.js';

function createSession(overrides = {}) {
  return {
    activeDeputeId: 'PA0001',
    lastResultVoteIds: [],
    lastResultQuery: '',
    lastFilters: null,
    lastSort: 'date_desc',
    lastLimit: null,
    lastScopeSource: 'depute_all',
    lastTheme: null,
    lastDateRange: null,
    lastPlan: null,
    pendingClarification: null,
    ...overrides
  };
}

function buildPayload(overrides = {}) {
  return JSON.stringify({
    comprise: true,
    confidence: 0.9,
    hypothese: 'Position du depute sur l ecologie',
    questions: [
      {
        intitule: 'Quelle est sa position sur l ecologie ?',
        operation: 'position_thematique',
        theme: 'ecologie',
        texte_cible: null,
        date_debut: null,
        date_fin: null,
        vote: null,
        limite: null,
        porte_sur_dernier_resultat: false
      }
    ],
    ...overrides
  });
}

describe('buildSemanticInterpreterPrompt', () => {
  it('inclut les themes autorises, le contexte et la question', () => {
    const prompt = buildSemanticInterpreterPrompt('Est-il écolo ?', {
      deputeName: 'Jean Dupont',
      today: '2026-07-09',
      hasLastResult: true
    });
    expect(prompt.systemPrompt).toContain('ecologie');
    expect(prompt.systemPrompt).toContain('fin de vie');
    expect(prompt.systemPrompt).toContain('Jean Dupont');
    expect(prompt.systemPrompt).toContain('2026-07-09');
    expect(prompt.messages).toHaveLength(2);
    expect(prompt.messages[1].content).toBe('Est-il écolo ?');
  });
});

describe('parseSemanticInterpretation', () => {
  it('extrait le JSON meme entoure de markdown', () => {
    const parsed = parseSemanticInterpretation('```json\n{"comprise": true}\n```');
    expect(parsed).toEqual({ comprise: true });
  });

  it('retourne null sur du texte libre', () => {
    expect(parseSemanticInterpretation('Je ne comprends pas la question.')).toBeNull();
  });
});

describe('resolveSemanticInterpretation - validation stricte', () => {
  it('convertit une position thematique valide en overrides de routage', () => {
    const resolution = resolveSemanticInterpretation(buildPayload(), createSession(), 'question originale');
    expect(resolution).not.toBeNull();
    expect(resolution.subQuestions).toHaveLength(1);
    const [subQuestion] = resolution.subQuestions;
    expect(subQuestion.intentOverride.kind).toBe('thematic_stance');
    expect(subQuestion.intentOverride.signals).toContain('semantic_interpreter');
    expect(subQuestion.scopeOverride.filters.theme).toBe('ecologie');
    expect(subQuestion.scopeOverride.source).toBe('explicit_filter');
    expect(resolution.assumptionText).toContain('Interprétation IA');
  });

  it('mappe un theme accentue ou avec majuscules sur la cle du lexique', () => {
    const payload = buildPayload({
      questions: [{ intitule: 'Votes fin de vie', operation: 'liste', theme: 'Fin de Vie' }]
    });
    const resolution = resolveSemanticInterpretation(payload, createSession(), 'q');
    expect(resolution.subQuestions[0].scopeOverride.filters.theme).toBe('fin de vie');
    expect(resolution.subQuestions[0].intentOverride.kind).toBe('list');
  });

  it('rejette un theme hors lexique plutot que de deviner', () => {
    const payload = buildPayload({
      questions: [{ intitule: 'x', operation: 'liste', theme: 'cryptomonnaie' }]
    });
    expect(resolveSemanticInterpretation(payload, createSession(), 'q')).toBeNull();
  });

  it('rejette une position thematique sans theme', () => {
    const payload = buildPayload({
      questions: [{ intitule: 'x', operation: 'position_thematique', theme: null }]
    });
    expect(resolveSemanticInterpretation(payload, createSession(), 'q')).toBeNull();
  });

  it('rejette comprise=false et confiance faible', () => {
    expect(resolveSemanticInterpretation(buildPayload({ comprise: false }), createSession(), 'q')).toBeNull();
    expect(resolveSemanticInterpretation(buildPayload({ confidence: 0.3 }), createSession(), 'q')).toBeNull();
  });

  it('plafonne le nombre de sous-questions et ne garde qu une analyse', () => {
    const entries = [
      { intitule: 'a', operation: 'analyse', theme: 'ecologie' },
      { intitule: 'b', operation: 'analyse', theme: 'sante' },
      { intitule: 'c', operation: 'comptage', theme: 'budget' },
      { intitule: 'd', operation: 'liste', theme: 'immigration' },
      { intitule: 'e', operation: 'liste', theme: 'logement' }
    ];
    const resolution = resolveSemanticInterpretation(buildPayload({ questions: entries }), createSession(), 'q');
    expect(resolution.subQuestions.length).toBeLessThanOrEqual(SEMANTIC_INTERPRETER_MAX_QUESTIONS);
    const analysisCount = resolution.subQuestions.filter(sub => sub.intentKind === 'analysis').length;
    expect(analysisCount).toBe(1);
    expect(resolution.subQuestions.map(sub => sub.intentKind)).toEqual(['analysis', 'count', 'list']);
  });

  it('assainit dates, limite et vote', () => {
    const payload = buildPayload({
      questions: [{
        intitule: 'Votes pour sur la sante en 2025',
        operation: 'liste',
        theme: 'sante',
        date_debut: '2025-01-01',
        date_fin: '2024-01-01',
        vote: 'Pour',
        limite: 500
      }]
    });
    const { scopeOverride } = resolveSemanticInterpretation(payload, createSession(), 'q').subQuestions[0];
    expect(scopeOverride.filters.dateFrom).toBeNull();
    expect(scopeOverride.filters.dateTo).toBeNull();
    expect(scopeOverride.filters.vote).toBe('pour');
    expect(scopeOverride.filters.limit).toBe(50);
  });

  it('cible le dernier resultat seulement s il existe', () => {
    const payload = buildPayload({
      questions: [{ intitule: 'x', operation: 'comptage', theme: null, porte_sur_dernier_resultat: true }]
    });
    const withResult = resolveSemanticInterpretation(
      payload,
      createSession({ lastResultVoteIds: ['1', '2'] }),
      'q'
    );
    expect(withResult.subQuestions[0].scopeOverride.source).toBe('last_result');
    expect(withResult.subQuestions[0].scopeOverride.voteIds).toEqual(['1', '2']);

    const withoutResult = resolveSemanticInterpretation(payload, createSession(), 'q');
    expect(withoutResult.subQuestions[0].scopeOverride.source).toBe('depute_all');
  });

  it('retombe sur la question originale quand l intitule manque', () => {
    const payload = buildPayload({
      questions: [{ operation: 'liste', theme: 'ecologie' }]
    });
    const resolution = resolveSemanticInterpretation(payload, createSession(), 'Question originale ?');
    expect(resolution.subQuestions[0].question).toBe('Question originale ?');
  });
});

describe('resolveSemanticInterpretation - integration routeur', () => {
  it('produit une route deterministe executable via routeQuestion', () => {
    const session = createSession();
    const resolution = resolveSemanticInterpretation(buildPayload(), session, 'Est-il écolo ?');
    const [subQuestion] = resolution.subQuestions;
    const route = routeQuestion(subQuestion.question, session, {
      questionOverride: subQuestion.question,
      scopeOverride: subQuestion.scopeOverride,
      intentOverride: subQuestion.intentOverride,
      skipPendingResolution: true
    });
    expect(route.action).toBe('deterministic');
    expect(route.plan.questionType).toBe('thematic_stance');
    expect(route.plan.responseMode).toBe('deterministic');
  });

  it('produit une route analysis_rag pour une operation analyse', () => {
    const session = createSession();
    const payload = buildPayload({
      questions: [{ intitule: 'Analyse ses votes sur la sante', operation: 'analyse', theme: 'sante' }]
    });
    const resolution = resolveSemanticInterpretation(payload, session, 'q');
    const [subQuestion] = resolution.subQuestions;
    const route = routeQuestion(subQuestion.question, session, {
      questionOverride: subQuestion.question,
      scopeOverride: subQuestion.scopeOverride,
      intentOverride: subQuestion.intentOverride,
      skipPendingResolution: true
    });
    expect(route.action).toBe('analysis_rag');
    expect(route.plan.requiresLlm).toBe(true);
  });
});
