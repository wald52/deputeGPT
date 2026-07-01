import { describe, it, expect } from 'vitest';
import { classifyIntent } from './intent-classifier.js';
import { resolveScope } from './scope-resolver.js';

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
    ...overrides
  };
}

function classify(question, session = createSession()) {
  const scope = resolveScope(question, session);
  return { scope, intent: classifyIntent(question, scope) };
}

describe('classifyIntent - ordre historique conserve', () => {
  it('route un comptage', () => {
    expect(classify('Combien de votes sur la sante ?').intent.kind).toBe('count');
  });

  it('route un taux de participation', () => {
    expect(classify('Quel est son taux de participation ?').intent.kind).toBe('participation_rate');
  });

  it('route une liste explicite', () => {
    expect(classify('Liste ses derniers votes').intent.kind).toBe('list');
  });

  it('route les sujets simples vers subjects', () => {
    expect(classify('Quels sont les sujets principaux de ses votes ?').intent.kind).toBe('subjects');
  });

  it('route une question thematique seule vers analysis', () => {
    expect(classify('Ses votes sur l ecologie ?').intent.kind).toBe('analysis');
  });

  it('retombe sur clarify sans aucun signal', () => {
    const { intent } = classify('Que penser de tout cela ?');
    expect(intent.kind).toBe('clarify');
    expect(intent.reason).toBe('unsupported');
  });
});

describe('classifyIntent - intensificateur d analyse', () => {
  it('prefere analysis a subjects quand un intensificateur et un theme sont presents', () => {
    const { intent } = classify('Quels sujets defend-il vraiment sur l ecologie ?');
    expect(intent.kind).toBe('analysis');
    expect(intent.signals).toContain('analysis_intensifier');
  });

  it('garde subjects sans ancrage concret', () => {
    expect(classify('Sur quoi vote-t-il vraiment ?').intent.kind).toBe('subjects');
  });

  it('route les critiques de loi vers analysis', () => {
    const { intent } = classify('La loi sur le climat est-elle vraiment bonne pour le climat ?');
    expect(intent.kind).toBe('analysis');
  });

  it('traite "incitations" comme un intensificateur', () => {
    const { intent } = classify('Est-ce que les incitations de la loi energie vont dans le sens du climat ?');
    expect(intent.kind).toBe('analysis');
  });
});

describe('classifyIntent - questions composites texte + theme', () => {
  it('conserve le theme mentionne hors du texte cible', () => {
    const { scope, intent } = classify("Sur l'écologie, comment a-t-il voté sur la loi Duplomb ?");
    expect(scope.filters.queryText).toBe('loi Duplomb');
    expect(scope.filters.theme).toBe('ecologie');
    expect(intent.kind).toBe('list');
  });

  it('annule le theme quand il ne vient que du texte cible', () => {
    const { scope } = classify('Comment a-t-il vote sur le projet de loi relatif a la souverainete energetique ?');
    expect(scope.filters.queryText).toBeTruthy();
    expect(scope.filters.theme).toBeNull();
  });
});

describe('classifyIntent - suivi elliptique', () => {
  it('herite du type de question du dernier plan sur un suivi elliptique', () => {
    const session = createSession({
      lastResultVoteIds: ['1', '2', '3'],
      lastPlan: { questionType: 'count' }
    });
    const { intent } = classify('Et en 2024 ?', session);
    expect(intent.kind).toBe('count');
    expect(intent.signals).toContain('inherited_follow_up');
  });

  it('herite d une analyse sur un nouveau theme', () => {
    const session = createSession({
      lastResultVoteIds: ['1', '2'],
      lastPlan: { questionType: 'analysis' }
    });
    const { intent } = classify("Et sur l'immigration ?", session);
    expect(intent.kind).toBe('analysis');
  });

  it('ne herite pas quand la question porte un signal explicite', () => {
    const session = createSession({
      lastResultVoteIds: ['1', '2'],
      lastPlan: { questionType: 'analysis' }
    });
    const { intent } = classify('Et les sujets de ces votes ?', session);
    expect(intent.kind).toBe('subjects');
  });

  it('ne herite pas sans nouveau filtre (clarification de mode attendue en aval)', () => {
    const session = createSession({
      lastResultVoteIds: ['1', '2'],
      lastPlan: { questionType: 'list' }
    });
    const { intent } = classify('Et ces votes ?', session);
    expect(intent.kind).toBe('clarify');
  });

  it('repond au taux de participation meme sans contexte de suivi', () => {
    const { intent } = classify('Et son taux de participation ?');
    expect(intent.kind).toBe('participation_rate');
  });
});

describe('classifyIntent - confiance', () => {
  it('expose une confiance reelle plutot que 1 constant', () => {
    const { intent } = classify('Quels sujets defend-il vraiment sur l ecologie ?');
    expect(intent.confidence).toBeGreaterThan(0.5);
    expect(intent.confidence).toBeLessThanOrEqual(1);
  });
});
