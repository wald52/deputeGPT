import { describe, it, expect, vi } from 'vitest';
import { createDossiersRepository } from './dossiers-repository.js';

const SAMPLE_INDEX = {
  schemaVersion: 1,
  scrutins: {
    '100': { dossierId: 'DLR5L17N1', method: 'title_containment', confidence: 0.95 },
    '101': { dossierId: 'DLR5L17N1', method: 'title_match', confidence: 0.8 },
    '200': { dossierId: 'DLR5L17N2', method: 'title_match', confidence: 0.7 },
    '300': { dossierId: null, method: 'none', confidence: 1 }
  },
  dossiers: {
    DLR5L17N1: {
      titre: 'Projet de loi de finances pour 2026',
      anUrl: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/plf_2026',
      scrutinNumeros: ['100', '101']
    },
    DLR5L17N2: {
      titre: 'Proposition de loi visant à la souveraineté énergétique et climatique de la France',
      anUrl: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/souverainete_energetique',
      scrutinNumeros: ['200']
    }
  }
};

const SAMPLE_FICHES_INDEX = {
  fiches: {
    DLR5L17N2: { titre: 'Proposition de loi souveraineté énergétique', verdictIncitations: 'incitations_mitigees' }
  }
};

const SAMPLE_FICHE = {
  dossierId: 'DLR5L17N2',
  titre: 'Proposition de loi visant à la souveraineté énergétique et climatique de la France',
  verdictIncitations: 'incitations_mitigees',
  objectifAffiche: 'Renforcer la souveraineté énergétique.',
  justificationVerdict: 'Les articles 2 et 3 créent des dérogations.',
  mecanismesCles: [],
  disclaimer: 'Analyse générée automatiquement par IA.'
};

function createFetchMock({ failIndex = false } = {}) {
  return vi.fn(async url => {
    const path = String(url);
    if (path.includes('dossiers/index.json')) {
      if (failIndex) {
        return { ok: false, status: 404 };
      }
      return { ok: true, json: async () => SAMPLE_INDEX };
    }
    if (path.includes('fiches_index.json')) {
      return { ok: true, json: async () => SAMPLE_FICHES_INDEX };
    }
    if (path.includes('fiches/DLR5L17N2.json')) {
      return { ok: true, json: async () => SAMPLE_FICHE };
    }
    return { ok: false, status: 404 };
  });
}

function createRepository(options = {}) {
  return createDossiersRepository({
    buildUrl: path => `https://example.test/${path}`,
    buildVersionedUrl: path => `https://example.test/${path}`,
    fetchImpl: createFetchMock(options),
    logger: { log: () => {}, warn: () => {} }
  });
}

describe('dossiers-repository', () => {
  it('charge l index et resout le dossier d un vote', async () => {
    const repository = createRepository();
    expect(await repository.ensureDossiersIndexReady()).toBe(true);
    expect(repository.getDossierIdForVote('100')).toBe('DLR5L17N1');
    expect(repository.getDossierIdForVote('300')).toBeNull();
    expect(repository.getDossier('DLR5L17N1')?.titre).toContain('finances');
  });

  it('degrade gracieusement quand l index est absent', async () => {
    const repository = createRepository({ failIndex: true });
    expect(await repository.ensureDossiersIndexReady()).toBe(false);
    expect(await repository.findDossierByQuery('projet de loi de finances pour 2026')).toBeNull();
    expect(await repository.collectFichesForVotes(['100'])).toEqual([]);
  });

  it('trouve un dossier par containment de titre', async () => {
    const repository = createRepository();
    const match = await repository.findDossierByQuery('projet de loi de finances pour 2026');
    expect(match?.dossierId).toBe('DLR5L17N1');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('trouve un dossier par recouvrement de tokens', async () => {
    const repository = createRepository();
    const match = await repository.findDossierByQuery('loi souveraineté énergétique climatique');
    expect(match?.dossierId).toBe('DLR5L17N2');
  });

  it('charge une fiche existante et met en cache l absence de fiche', async () => {
    const repository = createRepository();
    await repository.ensureDossiersIndexReady();
    const fiche = await repository.loadFiche('DLR5L17N2');
    expect(fiche?.verdictIncitations).toBe('incitations_mitigees');
    expect(await repository.loadFiche('DLR5L17N1')).toBeNull();
  });

  it('collecte les fiches dominantes pour un ensemble de votes', async () => {
    const repository = createRepository();
    const fiches = await repository.collectFichesForVotes(['100', '101', '200'], { maxFiches: 2 });
    expect(fiches).toHaveLength(1);
    expect(fiches[0].dossierId).toBe('DLR5L17N2');
    expect(fiches[0].fiche.verdictIncitations).toBe('incitations_mitigees');
  });
});
