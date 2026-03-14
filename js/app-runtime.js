import {
  DEFAULT_MODEL_ID,
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
import { loadDeputesData as fetchDeputesData } from './data/deputes-repository.js';
import { loadGroupesData as fetchGroupesData } from './data/groupes-repository.js';
import { loadModelCatalog as fetchModelCatalog } from './data/model-catalog-repository.js';
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
import { createPipelineRuntime as createPipelineRuntimeFactory } from './ai/pipeline-runtime.js';
import { createQwen3Runtime as createQwen3RuntimeFactory } from './ai/qwen3-runtime.js';
import { createQwen35Runtime as createQwen35RuntimeFactory } from './ai/qwen35-runtime.js';
import { createSemanticRagRuntime } from './ai/semantic-rag-runtime.js';
import {
  createGeneratorAdapter,
  createTransformersRuntimeManager,
} from './ai/transformers-runtime.js';
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
  createDeputePanelController,
  createHemicyclePanelController,
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

const transformersRuntime = createTransformersRuntimeManager();
const chatHistoryProvider = createChatHistoryProvider();

let modelCatalog = FALLBACK_MODEL_CATALOG;
let modelsConfig = [];
let deputesData = [];
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
const ANALYSIS_CONTEXT_MIN_VOTES = 6;
const ANALYSIS_SEARCH_RESULT_LIMIT = 80;
const ANALYSIS_MAX_NEW_TOKENS = 220;
const THEMATIC_STANCE_EXAMPLE_LIMIT = 4;

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

const searchIndexRepository = createSearchIndexRepository({
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
  setDeputesData: value => {
    deputesData = value;
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

const semanticRagRuntime = createSemanticRagRuntime({
  appState,
  transformersRuntime,
  hasWebGPU,
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
  lookupVoteSubject,
  lookupVoteThemeLabel
});

const {
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
  thematicStanceExampleLimit: THEMATIC_STANCE_EXAMPLE_LIMIT
});

function updateSessionFromResult(session, result) {
  return chatScopeController.updateSessionFromResult(session, result);
}

async function buildAnalysisContextVotes(route, question, deputeVotes) {
  return computeAnalysisContextVotes(route, question, deputeVotes, {
    resolveScopeVotes: resolveDeterministicScopeVotes,
    applyScopeFilters: applyScopedFiltersWithLookups,
    dedupeVotes,
    rankVotesForAnalysis,
    contextMinVotes: ANALYSIS_CONTEXT_MIN_VOTES,
    contextVoteLimit: ANALYSIS_CONTEXT_VOTE_LIMIT
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
  return createPipelineRuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime
  });
}

async function createQwen3Runtime(modelConfig, updateProgress) {
  return createQwen3RuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime,
    resolveThinkingModeFlag: (currentModelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(currentModelConfig, explicitValue)
  });
}

async function createQwen35Runtime(modelConfig, updateProgress) {
  return createQwen35RuntimeFactory(modelConfig, updateProgress, {
    transformersRuntime,
    resolveThinkingModeFlag: (currentModelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(currentModelConfig, explicitValue)
  });
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

const modelSelection = createModelSelectionController({
  appState,
  getModelsConfig: () => modelsConfig,
  defaultModelId: DEFAULT_MODEL_ID,
  defaultQuantId: DEFAULT_QUANT_ID,
  getStoredValue,
  setStoredValue,
  storageKeys: STORAGE_KEYS,
  formatDownloadSize,
  hasWebGPU,
  updateChatCapabilitiesBanner,
  addSystemMessage: message => addMessage('system', message),
  initAI: modelConfig => modelUiFacade.initAI(modelConfig),
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

const chatComposer = createChatComposer({
  appState,
  quickActions: CHAT_QUICK_ACTIONS
});

const chatViewport = createChatViewportController({
  emptyStateText: 'Selectionnez un depute, puis posez une question exacte (liste, nombre, periode, theme) ou lancez une analyse IA.'
});

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
  buildMessageReferencesFromVoteIds,
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  updateChatCapabilitiesBanner: () => chatAvailability.updateChatCapabilitiesBanner(),
  renderQuickActions: () => chatComposer.renderQuickActions()
});

const chatAvailability = createChatAvailabilityController({
  appState,
  hasWebGPU,
  resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelUiFacade.resolveThinkingModeFlag(modelConfig, explicitValue),
  updateChatScopeSummary: () => chatScopeController.updateChatScopeSummary(),
  renderQuickActions: () => chatComposer.renderQuickActions(),
  syncSendButtonState: () => chatComposer.syncSendButtonState(),
  adjustChatInputHeight: inputEl => chatComposer.adjustChatInputHeight(inputEl),
  updateChatEmptyState: () => chatViewport.updateChatEmptyState()
});

const chatPaginationController = createChatPaginationController({
  appState,
  chatSessionState,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  resolveVotesByIds,
  buildPaginationContinuationMessage,
  buildMessageReferencesFromVoteIds,
  addMessage,
  updateSessionFromResult: (session, result) => chatScopeController.updateSessionFromResult(session, result),
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
  updateChatCapabilitiesBanner: () => chatAvailability.updateChatCapabilitiesBanner(),
  renderQuickActions: () => chatComposer.renderQuickActions()
});

const chatRenderer = createChatRenderer({
  appState,
  defaultChatListLimit: DEFAULT_CHAT_LIST_LIMIT,
  formatChatTime,
  buildMessageReferencesFromVoteIds,
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
  dedupeVotes,
  ensureSearchIndexReady: () => appDataController.ensureSearchIndexReady(),
  executeDeterministicRoute,
  extractAnswerFromOutput,
  getChatHistory: () => chatHistoryProvider.getChatHistory(),
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

const chatHistoryPanel = createChatHistoryPanelController({
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
    initChatHistory: () => chatHistoryProvider.initChatHistory(),
    setupSearch: () => searchPanel.setupSearch(),
    setupChat: () => chatController.setupChat(),
    loadDeputesData: () => appDataController.loadDeputesData(),
    loadGroupesData: () => appDataController.loadGroupesData(),
    loadModelCatalog: () => appDataController.loadModelCatalog(),
    renderLegend: () => hemicyclePanel.renderLegend(),
    setupHemicycle: () => hemicyclePanel.setupHemicycle(),
    setupModelLoadUI: () => modelUiFacade.setupModelLoadUI(),
    setupChatHistoryUI: () => chatHistoryPanel.setupChatHistoryUI(),
    updateActiveModelBadge: modelConfig => modelUiFacade.updateActiveModelBadge(modelConfig),
    getActiveModelConfig: () => appState.activeModelConfig,
    updateModelSelectionSummary: () => modelUiFacade.updateModelSelectionSummary(),
    syncChatAvailability,
    scheduleSearchIndexWarmup: () => appDataController.scheduleSearchIndexWarmup(),
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
