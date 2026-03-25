import { describe, it, expect } from 'vitest';
import {
  detectVoteFilter,
  detectLimit,
  detectSort,
  detectCountRequest,
  detectTheme,
  detectListRequest,
  detectAnalysisRequest,
  detectMarker,
  extractDateRange,
  extractSpecificVoteQuery,
  detectSubjectRequest,
  detectParticipationRateRequest
} from './intent-detectors.js';
import { LIST_MARKERS, SUBJECT_MARKERS } from './router-constants.js';

describe('detectVoteFilter', () => {
  it('detecte abstention', () => {
    expect(detectVoteFilter('combien d abstention')).toBe('Abstention');
    expect(detectVoteFilter('les abstentions')).toBe('Abstention');
  });

  it('detecte non-votant', () => {
    expect(detectVoteFilter('non-votant')).toBe('Non-votant');
    expect(detectVoteFilter('non votants')).toBe('Non-votant');
  });

  it('detecte votes contre', () => {
    expect(detectVoteFilter('ses votes contre')).toBe('Contre');
    expect(detectVoteFilter('a vote contre')).toBe('Contre');
    expect(detectVoteFilter('voter contre')).toBe('Contre');
  });

  it('detecte votes pour', () => {
    expect(detectVoteFilter('ses votes pour')).toBe('Pour');
    expect(detectVoteFilter('a vote pour')).toBe('Pour');
    expect(detectVoteFilter('voter pour')).toBe('Pour');
  });

  it('retourne null si pas de filtre', () => {
    expect(detectVoteFilter('combien de votes')).toBeNull();
    expect(detectVoteFilter('')).toBeNull();
  });
});

describe('detectLimit', () => {
  it('detecte un nombre apres un marqueur de liste', () => {
    expect(detectLimit('montre 5 votes')).toBe(5);
    expect(detectLimit('liste 10 scrutins')).toBe(10);
  });

  it('detecte "derniers" + nombre', () => {
    expect(detectLimit('les 3 derniers votes')).toBe(3);
    expect(detectLimit('8 plus recents scrutins')).toBe(8);
  });

  it('detecte nombre + votes', () => {
    expect(detectLimit('15 votes')).toBe(15);
    expect(detectLimit('3 scrutins')).toBe(3);
  });

  it('retourne null sans nombre', () => {
    expect(detectLimit('montre les votes')).toBeNull();
    expect(detectLimit('')).toBeNull();
  });
});

describe('detectSort', () => {
  it('retourne date_asc pour les plus anciens', () => {
    expect(detectSort('les plus anciens')).toBe('date_asc');
    expect(detectSort('les premiers votes')).toBe('date_asc');
    expect(detectSort('5 premiers scrutins')).toBe('date_asc');
  });

  it('retourne date_desc par defaut', () => {
    expect(detectSort('les votes recents')).toBe('date_desc');
    expect(detectSort('')).toBe('date_desc');
  });
});

describe('detectCountRequest', () => {
  it('detecte combien', () => {
    expect(detectCountRequest('combien de votes')).toBe(true);
  });

  it('detecte nombre', () => {
    expect(detectCountRequest('nombre de scrutins')).toBe(true);
  });

  it('detecte total', () => {
    expect(detectCountRequest('total des votes')).toBe(true);
  });

  it('retourne false sinon', () => {
    expect(detectCountRequest('montre les votes')).toBe(false);
  });
});

describe('detectTheme', () => {
  it('detecte ecologie', () => {
    expect(detectTheme('votes sur l ecologie')).toBe('ecologie');
    expect(detectTheme('environnement et climat')).toBe('ecologie');
  });

  it('detecte immigration', () => {
    expect(detectTheme('politique immigration')).toBe('immigration');
  });

  it('detecte retraites', () => {
    expect(detectTheme('reforme des retraites')).toBe('retraites');
  });

  it('detecte budget', () => {
    expect(detectTheme('budget de l etat')).toBe('budget');
    expect(detectTheme('fiscalite')).toBe('budget');
  });

  it('detecte agriculture', () => {
    expect(detectTheme('loi duplomb agriculture')).toBe('agriculture');
  });

  it('detecte fin de vie', () => {
    expect(detectTheme('aide a mourir fin de vie')).toBe('fin de vie');
  });

  it('retourne null si aucun theme', () => {
    expect(detectTheme('combien de votes')).toBeNull();
  });
});

describe('detectListRequest', () => {
  it('detecte les marqueurs de liste', () => {
    expect(detectListRequest('liste les votes')).toBe(true);
    expect(detectListRequest('montre moi les scrutins')).toBe(true);
  });

  it('detecte les plus recents', () => {
    expect(detectListRequest('les votes plus recents')).toBe(true);
  });

  it('detecte derniers votes', () => {
    expect(detectListRequest('derniers votes')).toBe(true);
  });

  it('retourne false pour un sujet', () => {
    expect(detectListRequest('sujet des votes')).toBe(false);
  });

  it('retourne false pour un comptage', () => {
    expect(detectListRequest('combien de votes')).toBe(false);
  });
});

describe('detectAnalysisRequest', () => {
  it('detecte les marqueurs d analyse', () => {
    expect(detectAnalysisRequest('quel est la tendance')).toBe(true);
    expect(detectAnalysisRequest('resume de ses votes')).toBe(true);
    expect(detectAnalysisRequest('quelle position')).toBe(true);
  });

  it('retourne false pour une simple liste', () => {
    expect(detectAnalysisRequest('liste les votes')).toBe(false);
  });
});

describe('detectMarker', () => {
  it('trouve un marqueur dans la question', () => {
    expect(detectMarker('montre moi', ['montre', 'affiche'])).toBe(true);
  });

  it('retourne false si pas de correspondance', () => {
    expect(detectMarker('combien de votes', ['montre', 'affiche'])).toBe(false);
  });

  it('normalise les accents avant comparaison', () => {
    expect(detectMarker('résumé de ses votes', ['resume'])).toBe(true);
  });
});

describe('extractDateRange', () => {
  it('extrait une date exacte numerique', () => {
    const result = extractDateRange('vote du 15/03/2024');
    expect(result.dateFrom).toBe('2024-03-15');
    expect(result.dateTo).toBe('2024-03-15');
  });

  it('extrait une date exacte francaise', () => {
    const result = extractDateRange('vote du 15 mars 2024');
    expect(result.dateFrom).toBe('2024-03-15');
    expect(result.dateTo).toBe('2024-03-15');
  });

  it('extrait un mois et annee', () => {
    const result = extractDateRange('votes en mars 2024');
    expect(result.dateFrom).toBe('2024-03-01');
    expect(result.dateTo).toBe('2024-03-31');
  });

  it('extrait une annee', () => {
    const result = extractDateRange('votes en 2024');
    expect(result.dateFrom).toBe('2024-01-01');
    expect(result.dateTo).toBe('2024-12-31');
  });

  it('extrait cette annee', () => {
    const year = new Date().getFullYear();
    const result = extractDateRange('votes cette annee');
    expect(result.dateFrom).toBe(`${year}-01-01`);
    expect(result.dateTo).toBe(`${year}-12-31`);
  });

  it('extrait depuis une annee', () => {
    const result = extractDateRange('depuis 2022');
    expect(result.dateFrom).toBe('2022-01-01');
    expect(result.dateTo).toBeNull();
  });

  it('extrait entre deux annees', () => {
    const result = extractDateRange('entre 2022 et 2024');
    expect(result.dateFrom).toBe('2022-01-01');
    expect(result.dateTo).toBe('2024-12-31');
  });

  it('extrait le ce mandat', () => {
    const result = extractDateRange('ce mandat');
    expect(result.dateFrom).toBe('2022-06-01');
    expect(result.dateTo).toBeNull();
  });

  it('retourne null si pas de date', () => {
    const result = extractDateRange('combien de votes');
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });

  it('gerer le 1er du mois', () => {
    const result = extractDateRange('vote du 1er janvier 2024');
    expect(result.dateFrom).toBe('2024-01-01');
    expect(result.dateTo).toBe('2024-01-01');
  });
});

describe('extractSpecificVoteQuery', () => {
  it('extrait un texte de loi si assez specifique', () => {
    const result = extractSpecificVoteQuery('a vote sur la proposition de loi securite globale numero 42');
    expect(result).not.toBeNull();
  });

  it('extrait une proposition de loi (peut etre reduite par stopwords)', () => {
    const result = extractSpecificVoteQuery('montre le vote sur la proposition de loi immigration');
    expect(result).toContain('immigration');
  });

  it('extrait un sujet connu', () => {
    const result = extractSpecificVoteQuery('a vote sur la reforme des retraites');
    expect(result).toContain('reforme des retraites');
  });

  it('retourne null pour une question generique', () => {
    const result = extractSpecificVoteQuery('combien de votes');
    expect(result).toBeNull();
  });
});

describe('detectSubjectRequest', () => {
  it('detecte les marqueurs de sujet', () => {
    expect(detectSubjectRequest('quel sujet')).toBe(true);
    expect(detectSubjectRequest('sur quoi a vote')).toBe(true);
  });

  it('retourne false sinon', () => {
    expect(detectSubjectRequest('combien de votes')).toBe(false);
  });
});

describe('detectParticipationRateRequest', () => {
  it('detecte taux de participation', () => {
    expect(detectParticipationRateRequest('taux de participation')).toBe('general');
    expect(detectParticipationRateRequest('taux de presence')).toBe('general');
    expect(detectParticipationRateRequest('assiduite')).toBe('general');
  });

  it('detecte specialite', () => {
    expect(detectParticipationRateRequest('taux de presence textes importants')).toBe('specialite');
  });

  it('retourne null pour les questions de calcul', () => {
    expect(detectParticipationRateRequest('comment calcule le taux')).toBeNull();
  });

  it('retourne null pour qui', () => {
    expect(detectParticipationRateRequest('qui a vote')).toBeNull();
  });

  it('retourne null sinon', () => {
    expect(detectParticipationRateRequest('combien de votes')).toBeNull();
  });
});
