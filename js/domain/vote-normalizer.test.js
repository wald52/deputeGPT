import { describe, it, expect } from 'vitest';
import { normalizeQuestion, escapeRegExp, getVoteId, stripExtractedQueryFromQuestion } from './vote-normalizer.js';

describe('normalizeQuestion', () => {
  it('convertit en minuscules', () => {
    expect(normalizeQuestion('BUDGET')).toBe('budget');
  });

  it('supprime les accents', () => {
    expect(normalizeQuestion('réforme des retraites')).toBe('reforme des retraites');
    expect(normalizeQuestion('énergie nucléaire')).toBe('energie nucleaire');
    expect(normalizeQuestion('égalité')).toBe('egalite');
  });

  it('normalise les espaces multiples', () => {
    expect(normalizeQuestion('  comment   va  tu  ')).toBe('comment va tu');
  });

  it('trim les espaces en debut et fin', () => {
    expect(normalizeQuestion('  test  ')).toBe('test');
  });

  it('remplace les apostrophes typographiques', () => {
    expect(normalizeQuestion("c'est l\u2019heure")).toBe("c'est l'heure");
  });

  it('retourne une chaine vide pour null/undefined', () => {
    expect(normalizeQuestion(null)).toBe('');
    expect(normalizeQuestion(undefined)).toBe('');
    expect(normalizeQuestion('')).toBe('');
  });

  it('garde les caracteres alphanumeriques et ponctuation', () => {
    expect(normalizeQuestion('loi n° 123 du 5 mars')).toBe('loi n° 123 du 5 mars');
  });
});

describe('escapeRegExp', () => {
  it('echappe les caracteres speciaux regex', () => {
    expect(escapeRegExp('prix (TTC)')).toBe('prix \\(TTC\\)');
    expect(escapeRegExp('article 49.3')).toBe('article 49\\.3');
  });

  it('laisse les caracteres normaux intacts', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
  });

  it('retourne une chaine vide pour null/undefined', () => {
    expect(escapeRegExp(null)).toBe('');
    expect(escapeRegExp(undefined)).toBe('');
  });
});

describe('getVoteId', () => {
  it('retourne le numero si disponible', () => {
    expect(getVoteId({ numero: '1234', date: '2024-01-15', titre: 'test', vote: 'pour' })).toBe('1234');
  });

  it('retourne une chaine composee si pas de numero', () => {
    expect(getVoteId({ date: '2024-01-15', titre: 'Budget', vote: 'pour' })).toBe('2024-01-15|Budget|pour');
  });

  it('retourne une chaine vide pour null', () => {
    expect(getVoteId(null)).toBe('');
    expect(getVoteId(undefined)).toBe('');
  });

  it('ignore un numero vide', () => {
    expect(getVoteId({ numero: '', date: '2024-01-15', titre: 'test' })).toBe('2024-01-15|test|');
  });

  it('convertit le numero en string', () => {
    expect(getVoteId({ numero: 42 })).toBe('42');
  });

  it('utilise la composition si numero est des espaces', () => {
    expect(getVoteId({ numero: '   ', date: '2024-06-10' })).toBe('2024-06-10||');
  });
});

describe('stripExtractedQueryFromQuestion', () => {
  it('retourne la question si queryText vide', () => {
    expect(stripExtractedQueryFromQuestion('comment va-t-il ?', '')).toBe('comment va-t-il ?');
  });

  it('supprime le queryText de la question', () => {
    expect(stripExtractedQueryFromQuestion('montre le vote sur budget de l etat', 'budget de l etat')).toBe('montre le vote sur');
  });

  it('normalise les espaces apres suppression', () => {
    expect(stripExtractedQueryFromQuestion('montre  le   vote   sur   budget', 'budget')).toBe('montre le vote sur');
  });

  it('retourne la question originale pour null/undefined', () => {
    expect(stripExtractedQueryFromQuestion('test', null)).toBe('test');
    expect(stripExtractedQueryFromQuestion(null, 'query')).toBe('');
  });
});
