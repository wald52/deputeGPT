import {
  DEFAULT_MODEL_ID,
  DEFAULT_INFERENCE_SOURCE,
  DEFAULT_QUANT_ID,
  SCOPE_SOURCE_LABELS,
  STORAGE_KEYS,
} from './core/config.js';
import {
  appState,
  chatSessionState,
  resetChatSessionState,
} from './core/state.js';
import { createAppDataController } from './core/app-data-controller.js';
import { createAppBootstrap } from './core/app-bootstrap.js';
import { createChatHistoryProvider } from './core/chat-history-provider.js';
import { createChatHistoryPersistence } from './core/chat-history-persistence.js';
import {
  formatChatTime,
  formatDownloadSize,
  truncateAnalysisField,
} from './core/formatters.js';
import {
  autoCleanStorage,
  getStoredValue,
  setStoredValue,
} from './core/storage.js';
import {
  ensureDeputesDetailsReady as fetchDeputesDetailsReady,
  loadDeputesData as fetchDeputesData
} from './data/deputes-repository.js';
import { loadGroupesData as fetchGroupesData } from './data/groupes-repository.js';
import { loadModelCatalog as fetchModelCatalog } from './data/model-catalog-repository.js';
import { loadOpenRouterModels as fetchOpenRouterModels } from './data/openrouter-models-repository.js';
import { createDossiersRepository } from './data/dossiers-repository.js';
import { createSearchIndexRepository } from './data/search-index-repository.js';
import { loadDeputeVotes } from './data/votes-repository.js';
import {
  extractAnswerFromOutput,
  sanitizeGeneratedAnswer,
} from './ai/answer-sanitizer.js';
import { FALLBACK_MODEL_CATALOG } from './ai/fallback-model-catalog.js';
import { resolveGenerationOptions } from './ai/generation-options.js';
import { createModelLoader } from './ai/model-loader.js';
import { createModelUiFacade } from './ai/model-ui-facade.js';
import { createModelSelectionController } from './ai/model-selection.js';
import { createWorkerRagClient } from './ai/worker-rag-client.js';
import { createRemoteQueryEncoder } from './ai/remote-query-encoder.js';
import {
  createChatAvailabilityController,
  createChatComposer,
  createChatController,
  createChatHistoryPanelController,
  createChatPaginationController,
  createChatRenderer,
  createChatScopeController,
  createChatViewportController,
  createConsentModalController,
  createVoteSourceModalController,
  createDeputePanelController,
  createHemicyclePanelController,
  createMobileWorkspaceController,
  createSearchPanelController,
  createUiHelpers,
  escapeHtml,
  formatCirco,
  showLocalProtocolWarning,
} from './ui/index.js';
import {
  escapeRegExp,
  normalizeQuestion,
  stripExtractedQueryFromQuestion,
  getVoteId,
} from './domain/vote-normalizer.js';
import {
  getVoteIndexText as resolveVoteIndexText,
  getVoteMetadata as resolveVoteMetadata,
  getVoteSourceUrl as resolveVoteSourceUrl,
  getVoteSubject as resolveVoteSubject,
  getVoteThemeLabel as resolveVoteThemeLabel,
} from './domain/vote-metadata.js';
import {
  createVoteHelpers,
  dedupeVotes,
} from './domain/vote-helpers.js';
import { createThemeHelpers } from './domain/theme-helpers.js';
import { createQueryDisplayHelpers } from './domain/query-display.js';
import { createVoteTextHelpers } from './domain/vote-text.js';
import { createFilterDescriptionHelpers } from './domain/filter-descriptions.js';
import { createAnalysisRankingHelpers } from './domain/analysis-ranking.js';
import {
  ANALYSIS_MARKERS,
  ANALYSIS_STOPWORDS,
  DEFAULT_CHAT_LIST_LIMIT,
  FOLLOW_UP_MARKERS,
  LIST_MARKERS,
  SUBJECT_MARKERS,
  THEME_CATEGORY_ALIASES,
  THEME_KEYWORDS,
} from './domain/router-constants.js';
import { createScope } from './domain/router-primitives.js';
import {
  detectClosedVoteQuestion,
  detectSubjectRequest,
  detectThemeSummaryRequest,
} from './domain/intent-detectors.js';
import { classifyIntent } from './domain/intent-classifier.js';
import { resolveScope } from './domain/scope-resolver.js';
import { routeQuestion } from './domain/router.js';
import { computeAnalysisContextVotes } from './domain/analysis-context.js';
import { createDeterministicRouteExecutor } from './domain/deterministic-responses.js';
import {
  createScopedFiltersApplier,
  extractTargetQueryTokens,
  filterVotesByQuery as filterDeterministicVotesByQuery,
  filterVotesByTheme as filterDeterministicVotesByTheme,
  findGlobalVotesByQuery as findGlobalDeterministicVotesByQuery,
  resolveScopeVotes as resolveDeterministicScopeVotes,
  shouldClarifyLargeList,
} from './domain/deterministic-router.js';

const transformersRuntime = createLazyTransformersRuntimeManager();
const chatHistoryProvider = createChatHistoryProvider();

let modelCatalog = FALLBACK_MODEL_CATALOG;
let modelsConfig = [];
let deputesData = [];
let deputesDataDetailLevel = 'idle';
let deputesLatest = null;
let groupesPolitiques = [];

const DEPUTE_PHOTOS_DIR = 'public/data/deputes_photos';
const DEPUTE_PHOTO_PLACEHOLDER_URL = `${DEPUTE_PHOTOS_DIR}/placeholder.svg`;
const CHAT_QUICK_ACTIONS = [
  { label: '5 derniers votes', question: 'Liste les 5 derniers votes de ce député.' },
  { label: 'Nombre de votes pour', question: 'Combien de votes pour ce député ?' },
  { label: 'Votes contre récents', question: 'Montre les 10 derniers votes contre de ce député.' },
  { label: 'Thèmes principaux', question: 'Quels sont les thèmes principaux dans ces votes ?' }
];
const ANALYSIS_CONTEXT_VOTE_LIMIT = 18;
// Analyses ciblees (theme ou texte precis) : contexte plus court pour un
// prefill plus rapide, les fiches de lois compensant en densite.
const ANALYSIS_CONTEXT_TARGETED_VOTE_LIMIT = 12;
const ANALYSIS_CONTEXT_MIN_VOTES = 6;
const ANALYSIS_CONTEXT_FICHE_LIMIT = 2;
const ANALYSIS_SEARCH_RESULT_LIMIT = 80;
const ANALYSIS_MAX_NEW_TOKENS = 220;
const THEMATIC_STANCE_EXAMPLE_LIMIT = 4;

let aiRuntimeModulesPromise = null;
let transformersRuntimeManagerPromise = null;

async function loadAiRuntimeModules() {
  if (!aiRuntimeModulesPromise) {
    aiRuntimeModulesPromise = Promise.all([
      import('./ai/online-runtime.js'),
      import('./ai/pipeline-runtime.js'),
      import('./ai/qwen3-runtime.js'),
      import('./ai/qwen35-runtime.js'),
      import('./ai/gemma4-runtime.js'),
      import('./ai/semantic-rag-runtime.js'),
      import('./ai/transformers-runtime.js')
    ]).then(([
      onlineRuntimeModule,
      pipelineRuntimeModule,
      qwen3RuntimeModule,
      qwen35RuntimeModule,
      gemma4RuntimeModule,
      semanticRagRuntimeModule,
      transformersRuntimeModule
    ]) => ({
      createOnlineRuntime: onlineRuntimeModule.createOnlineRuntime,
      createPipelineRuntime: pipelineRuntimeModule.createPipelineRuntime,
      createQwen3Runtime: qwen3RuntimeModule.createQwen3Runtime,
      createQwen35Runtime: qwen35RuntimeModule.createQwen35Runtime,
      createGemma4Runtime: gemma4RuntimeModule.createGemma4Runtime,
      createSemanticRagRuntime: semanticRagRuntimeModule.createSemanticRagRuntime,
      createTransformersRuntimeManager: transformersRuntimeModule.createTransformersRuntimeManager
    }));
  }

  return aiRuntimeModulesPromise;
}

async function getTransformersRuntimeManager() {
  if (!transformersRuntimeManagerPromise) {
    transformersRuntimeManagerPromise = loadAiRuntimeModules()
      .then(({ createTransformersRuntimeManager }) => createTransformersRuntimeManager());
  }

  return transformersRuntimeManagerPromise;
}

function createGeneratorAdapter(runtime) {
  const adapter = async (messages, generationOptions) => runtime.invoke(messages, generationOptions);
  adapter.dispose = runtime.dispose;
  if (typeof runtime.resetCircuit === 'function') {
    adapter.resetCircuit = runtime.resetCircuit;
  }
  if (typeof runtime.getCircuitStatus === 'function') {
    adapter.getCircuitStatus = runtime.getCircuitStatus;
  }
  return adapter;
}

function buildUrl(rawPath) {
  return new URL(rawPath, window.location.href).toString();
}

function buildVersionedUrl(rawPath, versionToken = null) {
  const url = new URL(rawPath, window.location.href);
  if (versionToken) {
    url.searchParams.set('v', String(versionToken));
  }
  return url.toString();
}

function hasWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

let cachedWebGPUStatus = null;
let pendingWebGPUStatusPromise = null;

async function getWebGPUStatus({ forceRefresh = false } = {}) {
  if (!hasWebGPU()) {
    return {
      supported: false,
      adapterAvailable: false,
      reason: 'unsupported',
      message: 'WebGPU n est pas disponible sur cet appareil.'
    };
  }

  if (!forceRefresh && cachedWebGPUStatus) {
    return cachedWebGPUStatus;
  }

  if (!forceRefresh && pendingWebGPUStatusPromise) {
    return pendingWebGPUStatusPromise;
  }

  pendingWebGPUStatusPromise = (async () => {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      cachedWebGPUStatus = adapter
        ? {
            supported: true,
            adapterAvailable: true,
            reason: 'ok',
            message: ''
          }
        : {
            supported: true,
            adapterAvailable: false,
            reason: 'no_adapter',
            message: 'WebGPU est detecte, mais aucun adaptateur GPU compatible n est disponible dans ce navigateur.'
          };
    } catch (error) {
      const detail = String(error?.message || error || '').trim();
      cachedWebGPUStatus = {
        supported: true,
        adapterAvailable: false,
        reason: 'adapter_error',
        message: detail
          ? `WebGPU est detecte, mais l adaptateur GPU est indisponible sur cet appareil (${detail}).`
          : 'WebGPU est detecte, mais l adaptateur GPU est indisponible sur cet appareil.'
      };
    } finally {
      pendingWebGPUStatusPromise = null;
    }

    return cachedWebGPUStatus;
  })();

  return pendingWebGPUStatusPromise;
}

function createLazyTransformersRuntimeManager() {
  const state = {
    transformers: null,
    pipeline: null,
    env: null,
    AutoTokenizer: null,
    Qwen3ForCausalLM: null,
    activeRuntimeChannel: null
  };

  return {
    state,
    async loadRuntime(channel = 'stable') {
      const manager = await getTransformersRuntimeManager();
      const runtime = await manager.loadRuntime(channel);
      Object.assign(state, manager.state);
      return runtime;
    }
  };
}

function createLazySemanticRagRuntimeController({
  appState,
  transformersRuntime,
  hasWebGPU,
  getWebGPUStatus,
  ensureSemanticIndexReady,
  getSemanticSearchConfig,
  getSemanticIndex,
  getStoredValue,
  setStoredValue,
  storageKeys,
  addSystemMessage
}) {
  let runtimeInstance = null;
  let runtimePromise = null;

  function getSelectedMode() {
    return getStoredValue(storageKeys.semanticRagMode) || appState.semanticIndexMode || 'single_vector';
  }

  function isEnabled() {
    return getStoredValue(storageKeys.semanticRagEnabled) === 'true';
  }

  function isReady() {
    return (
      appState.semanticRagStatus === 'ready' &&
      Boolean(appState.semanticEncoder) &&
      Boolean(appState.semanticModelConfig?.modeId)
    );
  }

  function getStatus() {
    return {
      enabled: isEnabled(),
      ready: isReady(),
      status: appState.semanticRagStatus,
      modeId: appState.semanticIndexMode || getSelectedMode(),
      model: appState.semanticModelConfig
    };
  }

  async function ensureRuntime() {
    if (runtimeInstance) {
      return runtimeInstance;
    }

    if (!runtimePromise) {
      runtimePromise = loadAiRuntimeModules()
        .then(({ createSemanticRagRuntime }) => {
          runtimeInstance = createSemanticRagRuntime({
            appState,
            transformersRuntime,
            hasWebGPU,
            getWebGPUStatus,
            ensureSemanticIndexReady,
            getSemanticSearchConfig,
            getSemanticIndex,
            getStoredValue,
            setStoredValue,
            storageKeys,
            addSystemMessage,
            // Mode a requete distante : la question est encodee par le Worker
            // (workerRagClient est initialise au chargement du module, bien
            // avant la premiere activation du RAG semantique).
            createRemoteQueryEncoder: model => createRemoteQueryEncoder({ workerRagClient, model })
          });
          return runtimeInstance;
        });
    }

    return runtimePromise;
  }

  return {
    getSelectedMode,
    getStatus,
    isEnabled,
    isReady,
    async loadSemanticRag(mode) {
      const runtime = await ensureRuntime();
      return runtime.loadSemanticRag(mode);
    },
    async releaseSemanticRag() {
      if (!runtimeInstance && !runtimePromise) {
        appState.semanticEncoder = null;
        appState.semanticModelConfig = null;
        appState.semanticIndexMode = getSelectedMode();
        appState.semanticRagStatus = 'disabled';
        return;
      }

      const runtime = await ensureRuntime();
      return runtime.releaseSemanticRag();
    },
    async buildSemanticScores(question, votes, getVoteIdResolver) {
      if (!isEnabled() || !isReady()) {
        return new Map();
      }

      const runtime = await ensureRuntime();
      return runtime.buildSemanticScores(question, votes, getVoteIdResolver);
    }
  };
}

const searchIndexRepository = createSearchIndexRepository({
  buildUrl,
  buildVersionedUrl
});

const dossiersRepository = createDossiersRepository({
  buildUrl,
  buildVersionedUrl
});

const appDataController = createAppDataController({
  fetchModelCatalog,
  fallbackCatalog: FALLBACK_MODEL_CATALOG,
  setModelCatalog: value => {
    modelCatalog = value;
  },
  setModelsConfig: value => {
    modelsConfig = value;
  },
  populateModelSelect: () => modelUiFacade.populateModelSelect(),
  fetchDeputesData,
  ensureDeputesDetailsReady: fetchDeputesDetailsReady,
  setDeputesData: value => {
    deputesData = value;
  },
  setDeputesDataDetailLevel: value => {
    deputesDataDetailLevel = value;
  },
  setDeputesLatest: value => {
    deputesLatest = value;
  },
  fetchGroupesData,
  setGroupesPolitiques: value => {
    groupesPolitiques = value;
  },
  searchIndexRepository
});

function getSearchIndexData() {
  return searchIndexRepository.state.searchIndex || globalThis.searchIndex || null;
}

function isSearchIndexLexicallyReady() {
  return searchIndexRepository.state.searchIndexLoaded || Boolean(globalThis.searchIndexLoaded);
}

function getSemanticIndexData() {
  return searchIndexRepository.getSemanticIndex(semanticRagRuntime.getSelectedMode()) || null;
}

const semanticRagRuntime = createLazySemanticRagRuntimeController({
  appState,
  transformersRuntime,
  hasWebGPU,
  getWebGPUStatus,
  ensureSemanticIndexReady: mode => appDataController.ensureSemanticIndexReady(mode),
  getSemanticSearchConfig: mode => appDataController.getSemanticSearchConfig(mode),
  getSemanticIndex: mode => searchIndexRepository.getSemanticIndex(mode),
  getStoredValue,
  setStoredValue,
  storageKeys: STORAGE_KEYS,
  addSystemMessage: message => addMessage('system', message)
});

function resetChatSession(activeDeputeId = null) {
  resetChatSessionState(activeDeputeId);
  updateChatScopeSummary();
}

const voteHelpers = createVoteHelpers({
  getCurrentVotes: () => appState.currentDepute?.votes || [],
  getSearchIndexData,
  getVoteId,
  getVoteMetadata: resolveVoteMetadata,
  getVoteIndexText: resolveVoteIndexText,
  getVoteSubject: resolveVoteSubject,
  getVoteThemeLabel: resolveVoteThemeLabel,
  getVoteSourceUrl: resolveVoteSourceUrl,
  truncateAnalysisField
});

const {
  buildMessageReferencesFromVoteIds,
  lookupVoteIndexText,
  lookupVoteMetadata,
  lookupVoteSourceUrl,
  lookupVoteSubject,
  lookupVoteThemeLabel,
  resolveVotesByIds
} = voteHelpers;

const themeHelpers = createThemeHelpers({
  normalizeQuestion,
  themeCategoryAliases: THEME_CATEGORY_ALIASES,
  themeKeywords: THEME_KEYWORDS,
  lookupVoteMetadata,
  lookupVoteSubject
});

const {
  getThemeConfig,
  inferVoteThemeLabel,
  voteMatchesTheme
} = themeHelpers;

const queryDisplayHelpers = createQueryDisplayHelpers({
  getVoteId,
  lookupVoteSubject,
  normalizeQuestion,
  extractTargetQueryTokens
});

const {
  describeQueryFilter,
  describeQueryVotePhrase,
  extractQueryDisplayLabelFromVote
} = queryDisplayHelpers;

const filterDescriptionHelpers = createFilterDescriptionHelpers({
  describeQueryVotePhrase
});

const {
  describeClosedVoteTarget,
  describeDateFilter
} = filterDescriptionHelpers;

const voteTextHelpers = createVoteTextHelpers({
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  getVoteId,
  lookupVoteSubject,
  lookupVoteThemeLabel,
  lookupVoteSourceUrl
});

const {
  buildInlineVoteItems,
  buildLargeListClarification,
  buildPaginationContinuationMessage,
  formatVoteLine
} = voteTextHelpers;

const uiHelpers = createUiHelpers({
  deputePhotosDir: DEPUTE_PHOTOS_DIR,
  deputePhotoPlaceholderUrl: DEPUTE_PHOTO_PLACEHOLDER_URL
});

const {
  getDeputePhotoUrl
} = uiHelpers;

const chatHistoryPersistence = createChatHistoryPersistence({
  getChatHistory: () => chatHistoryProvider.getChatHistory()
});

const workerRagClient = createWorkerRagClient({
  getOnlineContext: () => (
    appState.activeModelConfig?.provider === DEFAULT_INFERENCE_SOURCE
    && appState.generator?.session
      ? {
        apiBaseUrl: appState.activeModelConfig.apiBaseUrl,
        session: appState.generator.session
      }
      : null
  )
});

function buildRerankDocumentText(vote) {
  const parts = [
    lookupVoteSubject(vote),
    vote?.titre || '',
    vote?.law_title || '',
    lookupVoteThemeLabel(vote) || ''
  ]
    .map(part => String(part || '').trim())
    .filter(Boolean);

  return [...new Set(parts)].join(' — ').slice(0, 480) || `scrutin ${getVoteId(vote) || ''}`.trim();
}

async function buildRemoteRerankScores(question, votes) {
  const voteIds = votes.map(getVoteId);
  const documents = votes.map(buildRerankDocumentText);
  const indexScores = await workerRagClient.rerank(question, documents, {
    cacheKey: `${normalizeQuestion(question)}::${voteIds.join(',')}`
  });

  if (!(indexScores instanceof Map) || indexScores.size === 0) {
    return null;
  }

  const scores = new Map();
  indexScores.forEach((score, index) => {
    const voteId = voteIds[index];
    if (voteId !== undefined && voteId !== null && Number.isFinite(score)) {
      scores.set(voteId, score);
    }
  });
  return scores;
}

const analysisRankingHelpers = createAnalysisRankingHelpers({
  normalizeQuestion,
  analysisStopwords: ANALYSIS_STOPWORDS,
  themeKeywords: THEME_KEYWORDS,
  hasLexicalSearchReady: () => isSearchIndexLexicallyReady() && Boolean(searchIndexRepository.state.miniSearch || globalThis.miniSearch),
  searchVotesInIndex: (query, limit) => searchIndexRepository.searchVotesInIndex(query, limit),
  analysisSearchResultLimit: ANALYSIS_SEARCH_RESULT_LIMIT,
  isSemanticRagEnabled: () => semanticRagRuntime.isEnabled(),
  isSemanticRagReady: () => semanticRagRuntime.isReady(),
  buildSemanticScores: (question, votes) => semanticRagRuntime.buildSemanticScores(question, votes, getVoteId),
  isRemoteRerankAvailable: () => workerRagClient.isRerankAvailable(),
  buildRemoteRerankScores,
  getVoteId,
  lookupVoteIndexText,
  lookupVoteSubject,
  lookupVoteThemeLabel
});

const {
  rankVotesForAnalysis
} = analysisRankingHelpers;

const applyScopedFiltersWithLookups = createScopedFiltersApplier({
  lookupVoteMetadata,
  lookupVoteIndexText,
  lookupVoteSubject,
  extractQueryDisplayLabelFromVote
});

function updateChatScopeSummary() {
  return chatScopeController.updateChatScopeSummary();
}

function buildDeterministicMessageMetadata(result, intentKind = 'list') {
  return chatScopeController.buildDeterministicMessageMetadata(result, intentKind);
}

function buildScopeActionRoute(actionType) {
  return chatScopeController.buildScopeActionRoute(actionType);
}

const executeDeterministicRoute = createDeterministicRouteExecutor({
  applyScopeFilters: applyScopedFiltersWithLookups,
  buildLargeListClarification,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  describeClosedVoteTarget,
  describeDateFilter,
  describeQueryFilter,
  describeQueryVotePhrase,
  detectClosedVoteQuestion,
  detectThemeSummaryRequest,
  findGlobalVotesByQuery: queryText => findGlobalDeterministicVotesByQuery(queryText, getSearchIndexData(), {
    lookupVoteIndexText,
    lookupVoteSubject,
    extractQueryDisplayLabelFromVote
  }),
  formatVoteLine,
  getVoteId,
  inferVoteThemeLabel,
  normalizeQuestion,
  resolveScopeVotes: resolveDeterministicScopeVotes,
  shouldClarifyLargeList,
  thematicStanceExampleLimit: THEMATIC_STANCE_EXAMPLE_LIMIT,
  themeKeywords: THEME_KEYWORDS,
  lookupVoteIndexText,
  findDossierByQuery: queryText => dossiersRepository.findDossierByQuery(queryText),
  loadDossierFiche: dossierId => dossiersRepository.loadFiche(dossierId),
  getFicheForVote: voteNumero => dossiersRepository.getFicheForVote(voteNumero)
});

function updateSessionFromResult(session, result) {
  return chatScopeController.updateSessionFromResult(session, result);
}

async function buildAnalysisContextVotes(route, question, deputeVotes) {
  const isTargetedAnalysis = Boolean(route?.scope?.filters?.theme || route?.scope?.filters?.queryText);
  return computeAnalysisContextVotes(route, question, deputeVotes, {
    resolveScopeVotes: resolveDeterministicScopeVotes,
    applyScopeFilters: applyScopedFiltersWithLookups,
    dedupeVotes,
    rankVotesForAnalysis,
    contextMinVotes: ANALYSIS_CONTEXT_MIN_VOTES,
    contextVoteLimit: isTargetedAnalysis ? ANALYSIS_CONTEXT_TARGETED_VOTE_LIMIT : ANALYSIS_CONTEXT_VOTE_LIMIT
  });
}

/**
 * Ajoute un message au chat avec optionnellement la méthode affichée
 * @param {string} type - 'user', 'ai', ou 'system'
 * @param {string} text - Contenu du message
 * @param {object} options - Options additionnelles
 * @param {string} options.method - Méthode utilisée (deterministic, analysis_rag, clarify, system, llm)
 * @param {object} options.metadata - Métadonnées à sauvegarder (voteIds, filters, etc.)
 */
async function addMessage(type, text, options = {}) {
  return chatRenderer.addMessage(type, text, options);
}

async function releaseCurrentModel() {
  return modelLoader.releaseCurrentModel();
}

async function createPipelineRuntime(modelConfig, updateProgress) {
  const { createPipelineRuntime: createPipelineRuntimeFactory } = await loadAiRuntimeModules();
  return createPipelineRuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime
  });
}

async function createQwen3Runtime(modelConfig, updateProgress) {
  const { createQwen3Runtime: createQwen3RuntimeFactory } = await loadAiRuntimeModules();
  return createQwen3RuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime,
    resolveThinkingModeFlag: (currentModelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(currentModelConfig, explicitValue)
  });
}

async function createQwen35Runtime(modelConfig, updateProgress) {
  const { createQwen35Runtime: createQwen35RuntimeFactory } = await loadAiRuntimeModules();
  return createQwen35RuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime,
    resolveThinkingModeFlag: (currentModelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(currentModelConfig, explicitValue)
  });
}

async function createGemma4Runtime(modelConfig, updateProgress) {
  const { createGemma4Runtime: createGemma4RuntimeFactory } = await loadAiRuntimeModules();
  return createGemma4RuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime,
    resolveThinkingModeFlag: (currentModelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(currentModelConfig, explicitValue)
  });
}

async function createOnlineRuntime(modelConfig) {
  const { createOnlineRuntime: createOnlineRuntimeFactory } = await loadAiRuntimeModules();
  return createOnlineRuntimeFactory(modelConfig);
}

const modelLoader = createModelLoader({
  appState,
  hasWebGPU,
  syncChatAvailability,
  updateActiveModelBadge: modelConfig => modelSelection.updateActiveModelBadge(modelConfig),
  setStoredValue,
  storageKeys: STORAGE_KEYS,
  transformersRuntime,
  createPipelineRuntime,
  createQwen3Runtime,
  createQwen35Runtime,
  createGemma4Runtime,
  createOnlineRuntime,
  createGeneratorAdapter,
  resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(modelConfig, explicitValue),
  syncActiveModelThinkingState: () => modelSelection.syncActiveModelThinkingState(),
  addSystemMessage: message => addMessage('system', message)
});

function updateChatCapabilitiesBanner() {
  return chatAvailability.updateChatCapabilitiesBanner();
}

const consentModal = createConsentModalController({
  appState,
  formatDownloadSize,
  resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(modelConfig, explicitValue)
});

const voteSourceModal = createVoteSourceModalController();

const modelSelection = createModelSelectionController({
  appState,
  getModelsConfig: () => modelsConfig,
  getModelCatalog: () => modelCatalog,
  fetchOpenRouterModels,
  defaultModelId: DEFAULT_MODEL_ID,
  defaultQuantId: DEFAULT_QUANT_ID,
  getStoredValue,
  setStoredValue,
  storageKeys: STORAGE_KEYS,
  formatDownloadSize,
  hasWebGPU,
  getWebGPUStatus,
  resolveGenerationOptions,
  analysisMaxNewTokens: ANALYSIS_MAX_NEW_TOKENS,
  syncChatAvailability: () => chatAvailability.syncChatAvailability(),
  updateChatCapabilitiesBanner,
  addSystemMessage: message => addMessage('system', message),
  initAI: modelConfig => modelUiFacade.initAI(modelConfig),
  releaseCurrentModel: () => modelLoader.releaseCurrentModel(),
  getSemanticSearchConfig: mode => appDataController.getSemanticSearchConfig(mode),
  getSemanticSearchModes: () => appDataController.getSemanticSearchModes(),
  getSemanticRagStatus: () => semanticRagRuntime.getStatus(),
  loadSemanticRag: mode => semanticRagRuntime.loadSemanticRag(mode),
  releaseSemanticRag: () => semanticRagRuntime.releaseSemanticRag(),
  consentModal
});

const modelUiFacade = createModelUiFacade({
  modelSelection,
  consentModal,
  modelLoader,
  getLoadUi: () => ({
    loadButton: document.getElementById('load-model-btn'),
    progressContainer: document.getElementById('progress-container'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressText: document.getElementById('progress-text')
  })
});

function prefetchOnlineSession() {
  // Non bloquant : rend le jeton disponible pour le rerank distant des la
  // premiere analyse sans jamais faire attendre le classement sur Turnstile.
  try {
    appState.generator?.session?.ensureSessionToken?.().catch(() => {});
  } catch (error) {
    // Le prechargement de session est un confort, jamais une condition.
  }
}

async function ensureOnlineAnalysisReady() {
  const selectedSource = modelUiFacade.getSelectedInferenceSource();
  if (selectedSource !== DEFAULT_INFERENCE_SOURCE) {
    return false;
  }

  if (appState.generator && appState.activeModelConfig?.provider === DEFAULT_INFERENCE_SOURCE) {
    prefetchOnlineSession();
    return true;
  }

  const modelConfig = modelUiFacade.getSelectedModelConfig();
  if (!modelConfig) {
    throw new Error('Le service IA en ligne n est pas configure dans le catalogue.');
  }

  await modelUiFacade.initAI(modelConfig, { quiet: true });
  prefetchOnlineSession();
  return true;
}

const chatComposer = createChatComposer({
  appState,
  quickActions: CHAT_QUICK_ACTIONS
});

const chatViewport = createChatViewportController({
  emptyStateText: 'Sélectionnez un député, puis posez une question exacte (liste, nombre, période, thème) ou lancez une analyse IA.'
});

let chatRenderer = null;
let chatPaginationController = null;

const chatScopeController = createChatScopeController({
  appState,
  chatSessionState,
  scopeSourceLabels: SCOPE_SOURCE_LABELS,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  createScope,
  normalizeQuestion,
  detectSubjectRequest,
  resolveVotesByIds,
  describeDateFilter,
  describeQueryFilter,
  truncateAnalysisField,
  addMessage,
  executeDeterministicRoute: (route, question, currentDepute) => executeDeterministicRoute(route, question, currentDepute),
  buildInlineVoteItems,
  buildMessageReferencesFromVoteIds,
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  syncInteractiveMessageStates: () => chatRenderer?.syncInteractiveMessageStates(),
  updateChatCapabilitiesBanner: () => chatAvailability.updateChatCapabilitiesBanner(),
  renderQuickActions: () => chatComposer.renderQuickActions()
});

const chatAvailability = createChatAvailabilityController({
  appState,
  hasWebGPU,
  getSelectedInferenceSource: () => modelUiFacade.getSelectedInferenceSource(),
  resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelUiFacade.resolveThinkingModeFlag(modelConfig, explicitValue),
  updateChatScopeSummary: () => chatScopeController.updateChatScopeSummary(),
  renderQuickActions: () => chatComposer.renderQuickActions(),
  syncSendButtonState: () => chatComposer.syncSendButtonState(),
  adjustChatInputHeight: inputEl => chatComposer.adjustChatInputHeight(inputEl),
  updateChatEmptyState: () => chatViewport.updateChatEmptyState()
});

chatPaginationController = createChatPaginationController({
  appState,
  chatSessionState,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  resolveVotesByIds,
  buildInlineVoteItems,
  buildPaginationContinuationMessage,
  addMessage,
  updateSessionFromResult: (session, result) => chatScopeController.updateSessionFromResult(session, result),
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  syncInteractiveMessageStates: () => chatRenderer?.syncInteractiveMessageStates(),
  updateChatCapabilitiesBanner: () => chatAvailability.updateChatCapabilitiesBanner(),
  renderQuickActions: () => chatComposer.renderQuickActions()
});

chatRenderer = createChatRenderer({
  appState,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  formatChatTime,
  buildMessageReferencesFromVoteIds,
  openVoteSourceModal: payload => voteSourceModal.showVoteSourceModal(payload),
  submitChatQuestion: question => chatComposer.submitChatQuestion(question),
  resolvePaginationOffset: metadata => chatPaginationController.resolvePaginationOffset(metadata),
  handlePaginationRequest: metadata => chatPaginationController.handlePaginationRequest(metadata),
  updateChatEmptyState,
  persistMessage: (payload, kind = 'message') => chatHistoryPersistence.persistChatMessage(payload, kind)
});

const chatController = createChatController({
  appState,
  chatSessionState,
  addMessage,
  adjustChatInputHeight,
  buildAnalysisContextVotes,
  buildDeterministicMessageMetadata: (result, intentKind = 'list') => chatScopeController.buildDeterministicMessageMetadata(result, intentKind),
  buildMessageReferencesFromVoteIds,
  collectFichesForAnalysis: voteNumeros => dossiersRepository.collectFichesForVotes(voteNumeros, {
    maxFiches: ANALYSIS_CONTEXT_FICHE_LIMIT
  }),
  dedupeVotes,
  ensureOnlineAnalysisReady,
  ensureSearchIndexReady: () => appDataController.ensureSearchIndexReady(),
  executeDeterministicRoute,
  extractAnswerFromOutput,
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  getSelectedInferenceSource: () => modelUiFacade.getSelectedInferenceSource(),
  getVoteId,
  hasWebGPU,
  isThinkingModeEnabled: () => modelUiFacade.isThinkingModeEnabled(),
  lookupVoteSubject,
  lookupVoteThemeLabel,
  renderAssistantMessage: (messagesDiv, loaderElement, answer, options = {}) => chatRenderer.renderAssistantMessage(messagesDiv, loaderElement, answer, options),
  renderQuickActions,
  resolveGenerationOptions,
  resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelUiFacade.resolveThinkingModeFlag(modelConfig, explicitValue),
  routeQuestion,
  sanitizeGeneratedAnswer,
  syncChatAvailability,
  syncSendButtonState,
  syncInteractiveMessageStates: () => chatRenderer.syncInteractiveMessageStates(),
  truncateAnalysisField,
  updateChatCapabilitiesBanner,
  updateChatEmptyState,
  updateSessionFromResult: (session, result) => chatScopeController.updateSessionFromResult(session, result),
  analysisMaxNewTokens: ANALYSIS_MAX_NEW_TOKENS
});

const hemicyclePanel = createHemicyclePanelController({
  appState,
  getDeputesData: () => deputesData,
  getGroupesPolitiques: () => groupesPolitiques,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl: DEPUTE_PHOTO_PLACEHOLDER_URL,
  escapeHtml,
  selectDepute: depute => selectDepute(depute)
});

const deputePanel = createDeputePanelController({
  appState,
  getPlacesMapping: () => hemicyclePanel.getPlacesMapping(),
  initChatHistory: () => chatHistoryProvider.initChatHistory(),
  resetChatSession,
  setActiveSeatByDepute: depute => hemicyclePanel.setActiveSeatByDepute(depute),
  updateChatScopeSummary: () => chatScopeController.updateChatScopeSummary(),
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  getActiveModelConfig: () => appState.activeModelConfig,
  clearRenderedMessages,
  updateChatEmptyState,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl: DEPUTE_PHOTO_PLACEHOLDER_URL,
  syncChatAvailability,
  loadDeputeVotes,
  addMessage
});

const searchPanel = createSearchPanelController({
  getDeputesData: () => deputesData,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl: DEPUTE_PHOTO_PLACEHOLDER_URL,
  formatCirco,
  selectDepute: depute => selectDepute(depute)
});

const mobileWorkspaceController = createMobileWorkspaceController({
  appState
});

const chatHistoryPanel = createChatHistoryPanelController({
  initChatHistory: () => chatHistoryProvider.initChatHistory(),
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  getDeputesData: () => deputesData,
  chatSessionState,
  updateChatScopeSummary: () => chatScopeController.updateChatScopeSummary(),
  clearRenderedMessages,
  updateChatEmptyState,
  addMessage,
  selectDepute: depute => selectDepute(depute),
  escapeHtml
});

function ensureChatEmptyState(messagesDiv = document.getElementById('messages')) {
  return chatViewport.ensureChatEmptyState(messagesDiv);
}

function clearRenderedMessages(messagesDiv = document.getElementById('messages')) {
  return chatViewport.clearRenderedMessages(messagesDiv);
}

function updateChatEmptyState() {
  return chatViewport.updateChatEmptyState();
}

function renderQuickActions() {
  return chatComposer.renderQuickActions();
}

function submitChatQuestion(question) {
  return chatComposer.submitChatQuestion(question);
}

function adjustChatInputHeight(inputEl = document.getElementById('user-input')) {
  return chatComposer.adjustChatInputHeight(inputEl);
}

function syncSendButtonState() {
  return chatComposer.syncSendButtonState();
}

function syncChatAvailability() {
  return chatAvailability.syncChatAvailability();
}

async function selectDepute(depute) {
  // Prechauffage des index (lexical + dossiers/fiches) des la selection d'un
  // depute : la premiere question analytique n'attend plus leur telechargement.
  appDataController.ensureSearchIndexReady().catch(() => {});
  dossiersRepository.ensureDossiersIndexReady().catch(() => {});
  dossiersRepository.ensureFichesIndexReady().catch(() => {});
  return deputePanel.selectDepute(depute);
}

/**
 * Affiche/masque le panneau d'historique
 */
async function toggleHistoryPanel() {
  return chatHistoryPanel.toggleHistoryPanel();
}

/**
 * Rafraîchit la liste des sessions dans le panneau
 */
async function refreshHistoryList() {
  return chatHistoryPanel.refreshHistoryList();
}

/**
 * Restaure une session depuis l'historique
 */
async function restoreSession(sessionId) {
  return chatHistoryPanel.restoreSession(sessionId);
}

/**
 * Affiche le menu d'export
 */
function showExportMenu() {
  return chatHistoryPanel.showExportMenu();
}

export async function init() {
  const appBootstrap = createAppBootstrap({
    autoCleanStorage,
    setupSearch: () => searchPanel.setupSearch(),
    setupChat: () => chatController.setupChat(),
    loadDeputesData: () => appDataController.loadDeputesData(),
    loadGroupesData: () => appDataController.loadGroupesData(),
    loadModelCatalog: () => appDataController.loadModelCatalog(),
    renderLegend: () => hemicyclePanel.renderLegend(),
    setupHemicycle: () => hemicyclePanel.setupHemicycleOnDemand(),
    setupModelLoadUI: () => modelUiFacade.setupModelLoadUI(),
    setupResponsiveLayout: () => mobileWorkspaceController.setupMobileWorkspace(),
    setupChatHistoryUI: () => chatHistoryPanel.setupChatHistoryUI(),
    updateActiveModelBadge: modelConfig => modelUiFacade.updateActiveModelBadge(modelConfig),
    getActiveModelConfig: () => appState.activeModelConfig,
    updateModelSelectionSummary: () => modelUiFacade.updateModelSelectionSummary(),
    syncChatAvailability,
    renderQuickActions,
    updateChatEmptyState,
    checkProtocol: () => showLocalProtocolWarning(),
    getDeputesData: () => deputesData,
    getStoredValue,
    setStoredValue,
    storageKeys: STORAGE_KEYS,
    populateModelSelect: () => modelUiFacade.populateModelSelect()
  });
  return appBootstrap.init();
}
