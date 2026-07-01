import {
  DOSSIERS_FICHES_DIR,
  DOSSIERS_FICHES_INDEX_PATH,
  DOSSIERS_INDEX_PATH,
} from '../core/config.js';

const DOSSIER_QUERY_STOPWORDS = new Set([
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux',
  'en', 'pour', 'par', 'sur', 'dans', 'ce', 'cette', 'ces', 'qui', 'que', 'dont', 'avec',
  'est', 'elle', 'il', 'projet', 'proposition', 'loi', 'lois', 'resolution', 'texte',
  'lecture', 'premiere', 'deuxieme', 'nouvelle', 'ensemble', 'relatif', 'relative',
  'visant', 'portant', 'tendant', 'modifiant', 'vraiment', 'reellement', 'realite'
]);

function normalizeDossierText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDossierQueryTokens(value) {
  return normalizeDossierText(value)
    .replace(/'/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 3 && !DOSSIER_QUERY_STOPWORDS.has(token));
}

export function createDossiersRepository({
  buildUrl,
  buildVersionedUrl,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const state = {
    index: null,
    indexLoaded: false,
    indexPromise: null,
    fichesIndex: null,
    fichesIndexPromise: null,
    ficheCache: new Map(),
    normalizedDossiers: null
  };

  async function fetchJson(path) {
    const response = await fetchImpl(buildVersionedUrl ? buildVersionedUrl(path) : buildUrl(path));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async function ensureDossiersIndexReady() {
    if (state.indexLoaded) {
      return Boolean(state.index);
    }

    if (state.indexPromise) {
      return state.indexPromise;
    }

    state.indexPromise = (async () => {
      try {
        state.index = await fetchJson(DOSSIERS_INDEX_PATH);
        logger.log(`✅ Index dossiers chargé : ${Object.keys(state.index?.dossiers || {}).length} dossiers.`);
      } catch (error) {
        // Dégradation gracieuse : l'app fonctionne sans le chaînage dossiers.
        state.index = null;
        logger.warn('ℹ️ Index dossiers indisponible (public/data/dossiers/index.json).');
      }
      state.indexLoaded = true;
      return Boolean(state.index);
    })();

    try {
      return await state.indexPromise;
    } finally {
      state.indexPromise = null;
    }
  }

  async function ensureFichesIndexReady() {
    if (state.fichesIndex !== null) {
      return true;
    }

    if (state.fichesIndexPromise) {
      return state.fichesIndexPromise;
    }

    state.fichesIndexPromise = (async () => {
      try {
        state.fichesIndex = await fetchJson(DOSSIERS_FICHES_INDEX_PATH);
      } catch (error) {
        state.fichesIndex = { fiches: {} };
      }
      return true;
    })();

    try {
      return await state.fichesIndexPromise;
    } finally {
      state.fichesIndexPromise = null;
    }
  }

  function getDossierIdForVote(voteNumero) {
    const link = state.index?.scrutins?.[String(voteNumero)];
    return link?.dossierId || null;
  }

  function getDossier(dossierId) {
    return state.index?.dossiers?.[String(dossierId)] || null;
  }

  function hasFiche(dossierId) {
    return Boolean(state.fichesIndex?.fiches?.[String(dossierId)]);
  }

  function getNormalizedDossiers() {
    if (state.normalizedDossiers) {
      return state.normalizedDossiers;
    }

    state.normalizedDossiers = Object.entries(state.index?.dossiers || {}).map(([dossierId, dossier]) => ({
      dossierId,
      dossier,
      normalizedTitle: normalizeDossierText(dossier?.titre),
      titleTokens: new Set(extractDossierQueryTokens(dossier?.titre))
    }));
    return state.normalizedDossiers;
  }

  async function findDossierByQuery(queryText) {
    await ensureDossiersIndexReady();
    if (!state.index) {
      return null;
    }

    const normalizedQuery = normalizeDossierText(queryText);
    const queryTokens = new Set(extractDossierQueryTokens(queryText));
    if (!normalizedQuery || queryTokens.size === 0) {
      return null;
    }

    let bestMatch = null;
    for (const candidate of getNormalizedDossiers()) {
      if (!candidate.normalizedTitle) {
        continue;
      }

      if (
        normalizedQuery.length >= 20 &&
        (candidate.normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(candidate.normalizedTitle))
      ) {
        return { dossierId: candidate.dossierId, dossier: candidate.dossier, confidence: 0.95 };
      }

      let overlap = 0;
      for (const token of queryTokens) {
        if (candidate.titleTokens.has(token)) {
          overlap += 1;
        }
      }
      if (overlap === 0) {
        continue;
      }

      const score = overlap / Math.max(queryTokens.size, 1);
      const coverage = overlap / Math.max(candidate.titleTokens.size, 1);
      const combined = (score + coverage) / 2;
      if (combined >= 0.45 && (!bestMatch || combined > bestMatch.confidence)) {
        bestMatch = { dossierId: candidate.dossierId, dossier: candidate.dossier, confidence: Math.round(combined * 100) / 100 };
      }
    }

    return bestMatch;
  }

  async function loadFiche(dossierId) {
    const key = String(dossierId || '').trim();
    if (!key) {
      return null;
    }

    if (state.ficheCache.has(key)) {
      return state.ficheCache.get(key);
    }

    await ensureFichesIndexReady();
    if (!hasFiche(key)) {
      state.ficheCache.set(key, null);
      return null;
    }

    try {
      const fiche = await fetchJson(`${DOSSIERS_FICHES_DIR}/${key}.json`);
      state.ficheCache.set(key, fiche);
      return fiche;
    } catch (error) {
      logger.warn(`⚠️ Fiche indisponible pour le dossier ${key}.`, error);
      state.ficheCache.set(key, null);
      return null;
    }
  }

  async function collectFichesForVotes(voteNumeros, { maxFiches = 2 } = {}) {
    await ensureDossiersIndexReady();
    if (!state.index) {
      return [];
    }
    await ensureFichesIndexReady();

    const dossierCounts = new Map();
    for (const numero of voteNumeros || []) {
      const dossierId = getDossierIdForVote(numero);
      if (dossierId && hasFiche(dossierId)) {
        dossierCounts.set(dossierId, (dossierCounts.get(dossierId) || 0) + 1);
      }
    }

    const rankedDossierIds = [...dossierCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, maxFiches)
      .map(([dossierId]) => dossierId);

    const fiches = [];
    for (const dossierId of rankedDossierIds) {
      const fiche = await loadFiche(dossierId);
      if (fiche) {
        fiches.push({ dossierId, fiche, voteCount: dossierCounts.get(dossierId) || 0 });
      }
    }
    return fiches;
  }

  return {
    state,
    collectFichesForVotes,
    ensureDossiersIndexReady,
    ensureFichesIndexReady,
    findDossierByQuery,
    getDossier,
    getDossierIdForVote,
    hasFiche,
    loadFiche
  };
}
