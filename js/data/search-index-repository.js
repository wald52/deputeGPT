import {
  LEGACY_SEARCH_INDEX_PATH,
  RAG_LEXICAL_INDEX_PATH,
  RAG_MANIFEST_PATH,
  RAG_SEMANTIC_INDEX_PATH,
  RAG_SEMANTIC_MULTIVECTOR_INDEX_PATH,
} from '../core/config.js';

const DEFAULT_SEMANTIC_MODE = 'single_vector';

function createFallbackArtifactInfo(path, versionToken = null, extra = {}) {
  return {
    available: true,
    path,
    versionToken,
    ...extra
  };
}

function normalizeSemanticModeId(mode) {
  return String(mode || DEFAULT_SEMANTIC_MODE).trim() || DEFAULT_SEMANTIC_MODE;
}

function buildLegacySingleVectorMode(manifest = null) {
  return {
    id: DEFAULT_SEMANTIC_MODE,
    label: 'Single-vector',
    strategy: 'single_vector',
    default: true,
    experimental: false,
    notes: manifest?.embeddingModel?.notes || '',
    model: manifest?.embeddingModel || null,
    artifact: manifest?.artifacts?.semanticIndex || null
  };
}

function getFallbackSemanticArtifactPath(modeId) {
  return modeId === 'multi_vector'
    ? RAG_SEMANTIC_MULTIVECTOR_INDEX_PATH
    : RAG_SEMANTIC_INDEX_PATH;
}

export function createSearchIndexRepository({
  buildUrl,
  buildVersionedUrl,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const state = {
    ragManifest: null,
    ragManifestPromise: null,
    searchIndex: null,
    miniSearch: null,
    searchIndexLoaded: false,
    searchIndexLoadPromise: null,
    searchIndexArtifactInfo: null,
    semanticIndexes: {},
    semanticIndexLoadedModes: {},
    semanticIndexLoadPromises: {},
    semanticArtifactInfos: {}
  };

  async function resolveRagManifest() {
    if (state.ragManifest) {
      return state.ragManifest;
    }

    if (state.ragManifestPromise) {
      return state.ragManifestPromise;
    }

    state.ragManifestPromise = (async () => {
      try {
        const manifestResponse = await fetchImpl(RAG_MANIFEST_PATH, { cache: 'no-store' });
        if (!manifestResponse.ok) {
          throw new Error(`HTTP ${manifestResponse.status}`);
        }

        state.ragManifest = await manifestResponse.json();
        return state.ragManifest;
      } catch (error) {
        logger.warn('⚠️ Manifest RAG indisponible, fallback vers les chemins publics par defaut.');
        state.ragManifest = null;
        return null;
      } finally {
        state.ragManifestPromise = null;
      }
    })();

    return state.ragManifestPromise;
  }

  function buildSemanticModesFromManifest(manifest = null) {
    const manifestModes = manifest?.semanticModes;
    if (manifestModes && typeof manifestModes === 'object') {
      return Object.values(manifestModes)
        .filter(Boolean)
        .map(entry => ({
          id: entry.id || DEFAULT_SEMANTIC_MODE,
          label: entry.label || entry.id || DEFAULT_SEMANTIC_MODE,
          strategy: entry.strategy || 'single_vector',
          default: entry.default === true,
          experimental: entry.experimental === true,
          notes: entry.notes || '',
          model: entry.model || null,
          artifact: entry.artifact || null
        }));
    }

    return [buildLegacySingleVectorMode(manifest)];
  }

  async function getSemanticSearchModes() {
    const manifest = await resolveRagManifest();
    const modes = buildSemanticModesFromManifest(manifest);
    return modes.sort((left, right) => Number(right.default === true) - Number(left.default === true));
  }

  async function resolveSearchIndexArtifactInfo() {
    if (state.searchIndexArtifactInfo) {
      return state.searchIndexArtifactInfo;
    }

    const manifest = await resolveRagManifest();
    const artifactPath = manifest?.artifacts?.lexicalIndex?.path;
    const versionToken = manifest?.artifacts?.lexicalIndex?.sha256 || manifest?.generatedAt || null;

    if (!artifactPath) {
      state.searchIndexArtifactInfo = createFallbackArtifactInfo(buildUrl(RAG_LEXICAL_INDEX_PATH), versionToken);
      return state.searchIndexArtifactInfo;
    }

    if (artifactPath.startsWith('http') || artifactPath.startsWith('/')) {
      state.searchIndexArtifactInfo = createFallbackArtifactInfo(artifactPath, versionToken);
      return state.searchIndexArtifactInfo;
    }

    state.searchIndexArtifactInfo = createFallbackArtifactInfo(
      new URL(artifactPath, buildUrl(RAG_MANIFEST_PATH)).toString(),
      versionToken
    );
    return state.searchIndexArtifactInfo;
  }

  async function resolveSemanticArtifactInfo(mode = DEFAULT_SEMANTIC_MODE) {
    const requestedModeId = normalizeSemanticModeId(mode);
    if (state.semanticArtifactInfos[requestedModeId]) {
      return state.semanticArtifactInfos[requestedModeId];
    }

    const manifest = await resolveRagManifest();
    const modes = await getSemanticSearchModes();
    const resolvedMode = modes.find(entry => entry.id === requestedModeId)
      || modes.find(entry => entry.default)
      || modes[0]
      || buildLegacySingleVectorMode(manifest);
    const modeId = resolvedMode.id || DEFAULT_SEMANTIC_MODE;
    const artifact = resolvedMode.artifact || null;
    const model = resolvedMode.model || null;

    if (!artifact?.path || !model?.browserModelId) {
      state.semanticArtifactInfos[requestedModeId] = {
        available: false,
        modeId,
        label: resolvedMode.label || modeId,
        strategy: resolvedMode.strategy || 'single_vector',
        experimental: resolvedMode.experimental === true,
        notes: resolvedMode.notes || '',
        path: buildUrl(getFallbackSemanticArtifactPath(modeId)),
        versionToken: null,
        artifact: null,
        model
      };
      return state.semanticArtifactInfos[requestedModeId];
    }

    const artifactPath = artifact.path.startsWith('http') || artifact.path.startsWith('/')
      ? artifact.path
      : new URL(artifact.path, buildUrl(RAG_MANIFEST_PATH)).toString();

    state.semanticArtifactInfos[requestedModeId] = {
      available: true,
      modeId,
      label: resolvedMode.label || modeId,
      strategy: resolvedMode.strategy || 'single_vector',
      default: resolvedMode.default === true,
      experimental: resolvedMode.experimental === true,
      notes: resolvedMode.notes || '',
      path: artifactPath,
      versionToken: artifact.sha256 || manifest?.generatedAt || null,
      artifact,
      model
    };
    return state.semanticArtifactInfos[requestedModeId];
  }

  async function loadSearchIndex() {
    if (state.searchIndexLoaded && state.miniSearch && state.searchIndex?.votes) {
      return true;
    }

    if (state.searchIndexLoadPromise) {
      return state.searchIndexLoadPromise;
    }

    state.searchIndexLoadPromise = (async () => {
      const artifactInfo = await resolveSearchIndexArtifactInfo();
      const candidatePaths = [
        buildVersionedUrl(artifactInfo.path, artifactInfo.versionToken),
        buildVersionedUrl(RAG_LEXICAL_INDEX_PATH, artifactInfo.versionToken),
        buildUrl(LEGACY_SEARCH_INDEX_PATH)
      ]
        .filter(Boolean)
        .filter((path, index, array) => array.indexOf(path) === index);

      for (const candidatePath of candidatePaths) {
        try {
          const response = await fetchImpl(candidatePath);
          if (!response.ok) {
            continue;
          }

          const candidateIndex = await response.json();
          const MiniSearchCtor = globalThis.MiniSearch;
          if (!candidateIndex.votes || typeof MiniSearchCtor === 'undefined') {
            continue;
          }

          state.searchIndex = candidateIndex;
          const votesArray = Object.entries(state.searchIndex.votes).map(([numero, data]) => ({
            id: numero,
            numero,
            titre: data.titre || '',
            keywords: (data.keywords || []).join(' '),
            category: data.category || '',
            theme: data.theme || data.category || '',
            subject: data.subject || '',
            summary: data.summary || '',
            date: data.date || '',
            source_url: data.source_url || ''
          }));

          state.miniSearch = new MiniSearchCtor({
            fields: ['titre', 'subject', 'keywords', 'summary', 'theme', 'category'],
            storeFields: ['numero', 'titre', 'subject', 'date', 'theme', 'category', 'summary', 'source_url'],
            searchOptions: {
              boost: { keywords: 3, titre: 2, subject: 2, summary: 1.2, theme: 1.5 },
              fuzzy: 0.2,
              prefix: true
            }
          });

          state.miniSearch.addAll(votesArray);
          state.searchIndexLoaded = true;
          logger.log(`✅ Index lexical charge depuis ${candidatePath}: ${votesArray.length} scrutins.`);
          return true;
        } catch (error) {
          logger.warn(`⚠️ Impossible de charger l'index lexical depuis ${candidatePath}`, error);
        }
      }

      logger.warn('⚠️ Aucun index lexical charge.');
      return false;
    })();

    try {
      return await state.searchIndexLoadPromise;
    } finally {
      state.searchIndexLoadPromise = null;
    }
  }

  async function loadSemanticIndex(mode = DEFAULT_SEMANTIC_MODE) {
    const artifactInfo = await resolveSemanticArtifactInfo(mode);
    const modeId = artifactInfo.modeId || normalizeSemanticModeId(mode);
    if (state.semanticIndexLoadedModes[modeId] && state.semanticIndexes[modeId]?.votes) {
      return true;
    }

    if (state.semanticIndexLoadPromises[modeId]) {
      return state.semanticIndexLoadPromises[modeId];
    }

    state.semanticIndexLoadPromises[modeId] = (async () => {
      if (!artifactInfo.available) {
        return false;
      }

      const candidatePaths = [
        buildVersionedUrl(artifactInfo.path, artifactInfo.versionToken),
        buildVersionedUrl(getFallbackSemanticArtifactPath(modeId), artifactInfo.versionToken)
      ]
        .filter(Boolean)
        .filter((path, index, array) => array.indexOf(path) === index);

      for (const candidatePath of candidatePaths) {
        try {
          const response = await fetchImpl(candidatePath);
          if (!response.ok) {
            continue;
          }

          const payload = await response.json();
          if (!payload?.votes || !payload?.model) {
            continue;
          }

          state.semanticIndexes[modeId] = payload;
          state.semanticIndexLoadedModes[modeId] = true;
          logger.log(`✅ Index semantique (${modeId}) charge depuis ${candidatePath}.`);
          return true;
        } catch (error) {
          logger.warn(`⚠️ Impossible de charger l'index semantique ${modeId} depuis ${candidatePath}`, error);
        }
      }

      logger.warn(`⚠️ Aucun index semantique charge pour le mode ${modeId}.`);
      return false;
    })();

    try {
      return await state.semanticIndexLoadPromises[modeId];
    } finally {
      state.semanticIndexLoadPromises[modeId] = null;
    }
  }

  async function ensureSearchIndexReady() {
    try {
      return await loadSearchIndex();
    } catch (error) {
      logger.warn('⚠️ Chargement differe de l\'index lexical impossible.', error);
      return false;
    }
  }

  async function ensureSemanticIndexReady(mode = DEFAULT_SEMANTIC_MODE) {
    try {
      return await loadSemanticIndex(mode);
    } catch (error) {
      logger.warn('⚠️ Chargement differe de l\'index semantique impossible.', error);
      return false;
    }
  }

  async function getSemanticSearchConfig(mode = DEFAULT_SEMANTIC_MODE) {
    const artifactInfo = await resolveSemanticArtifactInfo(mode);
    const model = artifactInfo?.model || null;
    const artifact = artifactInfo?.artifact || null;
    const artifactDownloadMb = artifact?.bytes ? Math.round((artifact.bytes / (1024 * 1024)) * 10) / 10 : null;
    const modelDownloadMb = model?.estimatedDownloadMb ?? null;

    return {
      available: Boolean(artifactInfo?.available && model?.browserModelId),
      modeId: artifactInfo?.modeId || normalizeSemanticModeId(mode),
      label: artifactInfo?.label || normalizeSemanticModeId(mode),
      strategy: artifactInfo?.strategy || 'single_vector',
      experimental: artifactInfo?.experimental === true,
      default: artifactInfo?.default === true,
      notes: artifactInfo?.notes || '',
      model: model ? {
        id: model.id || null,
        browserModelId: model.browserModelId,
        pythonModelId: model.pythonModelId || null,
        task: model.task || 'feature-extraction',
        pooling: model.pooling || 'mean',
        normalize: model.normalize !== false,
        estimatedDownloadMb: modelDownloadMb,
        notes: model.notes || ''
      } : null,
      artifact: artifact ? {
        ...artifact,
        downloadMb: artifactDownloadMb
      } : null,
      totalEstimatedDownloadMb: [artifactDownloadMb, modelDownloadMb]
        .filter(value => Number.isFinite(value))
        .reduce((sum, value) => sum + value, 0)
    };
  }

  function scheduleSearchIndexWarmup() {
    if (state.searchIndexLoaded || state.searchIndexLoadPromise) {
      return;
    }

    const warmup = () => {
      ensureSearchIndexReady();
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => warmup(), { timeout: 2500 });
      return;
    }

    setTimeout(warmup, 0);
  }

  function searchVotesInIndex(query, limit = 15) {
    if (!state.miniSearch || !state.searchIndexLoaded) {
      return [];
    }

    try {
      return state.miniSearch.search(query, { limit });
    } catch (error) {
      logger.error('Erreur recherche MiniSearch:', error);
      return [];
    }
  }

  function filterVotesByDepute(searchResults, deputeVotes) {
    if (!deputeVotes || deputeVotes.length === 0) {
      return [];
    }

    const deputeVoteNumbers = new Set(deputeVotes.map(vote => String(vote.numero)));

    return searchResults
      .filter(result => deputeVoteNumbers.has(String(result.numero)))
      .map(result => {
        const deputeVote = deputeVotes.find(vote => String(vote.numero) === String(result.numero));
        return {
          ...result,
          vote: deputeVote?.vote || 'Inconnu',
          sort: deputeVote?.sort || ''
        };
      });
  }

  function getSemanticIndex(mode = DEFAULT_SEMANTIC_MODE) {
    return state.semanticIndexes[normalizeSemanticModeId(mode)] || null;
  }

  return {
    state,
    ensureSearchIndexReady,
    ensureSemanticIndexReady,
    filterVotesByDepute,
    getSemanticIndex,
    getSemanticSearchConfig,
    getSemanticSearchModes,
    loadSearchIndex,
    loadSemanticIndex,
    resolveRagManifest,
    resolveSearchIndexArtifactInfo,
    resolveSemanticArtifactInfo,
    scheduleSearchIndexWarmup,
    searchVotesInIndex
  };
}
