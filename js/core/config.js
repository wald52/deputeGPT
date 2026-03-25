export const STORAGE_KEYS = {
  inferenceSource: 'deputegpt:inference-source',
  modelId: 'deputegpt:last-model-id',
  quantId: 'deputegpt:last-quant-id',
  acceptedModelId: 'deputegpt:last-accepted-model-id',
  acceptedQuantId: 'deputegpt:last-accepted-quant-id',
  openRouterModelId: 'deputegpt:openrouter-model-id',
  openRouterApiKey: 'deputegpt:openrouter-api-key',
  openRouterRememberKey: 'deputegpt:openrouter-remember-key',
  thinkingMode: 'deputegpt:thinking-mode',
  semanticRagEnabled: 'deputegpt:semantic-rag-enabled',
  semanticRagMode: 'deputegpt:semantic-rag-mode',
  acceptedEmbeddingModelId: 'deputegpt:last-accepted-embedding-model-id',
};

export const STORAGE_KEY_PREFIX = 'deputegpt:';
export const CHAT_HISTORY_DB_NAME = 'deputegpt-chat-history';
export const MANAGED_CACHE_PREFIXES = [
  'deputegpt',
];

export const DEFAULT_INFERENCE_SOURCE = 'online';
export const DEFAULT_MODEL_ID = 'qwen3-0.6b';
export const DEFAULT_QUANT_ID = 'q4f16';

export const MODEL_CATALOG_PATH = 'public/data/model-catalog.json';
export const RAG_MANIFEST_PATH = 'public/data/rag/manifest.json';
export const RAG_LEXICAL_INDEX_PATH = 'public/data/rag/lexical_index.json';
export const RAG_SEMANTIC_INDEX_PATH = 'public/data/rag/semantic_index.json';
export const RAG_SEMANTIC_MULTIVECTOR_INDEX_PATH = 'public/data/rag/semantic_multivector_index.json';
export const LEGACY_SEARCH_INDEX_PATH = 'public/data/search_index.json';

export const DEFAULT_NON_THINKING_GENERATION = {
  temperature: 0.7,
  top_p: 0.8,
  top_k: 20,
  min_p: 0
};

export const DEFAULT_THINKING_GENERATION = {
  temperature: 0.6,
  top_p: 0.95,
  top_k: 20,
  min_p: 0
};

export const CIRCUIT_BREAKER = {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 1
};

export const ASSEMBLEE_SCRUTIN_URL_BASE = 'https://www.assemblee-nationale.fr/dyn/17/scrutins/';

export const SCOPE_SOURCE_LABELS = {
  depute_all: 'tout l historique',
  explicit_filter: 'sous-ensemble filtre',
  last_result: 'dernier resultat'
};
