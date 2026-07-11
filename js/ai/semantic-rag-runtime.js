const DEFAULT_SEMANTIC_MODE = 'single_vector';

function flattenEmbeddingOutput(value) {
  if (!value) {
    return [];
  }

  if (typeof value.tolist === 'function') {
    return flattenEmbeddingOutput(value.tolist());
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value, Number);
  }

  if (Array.isArray(value)) {
    let current = value;
    while (Array.isArray(current[0])) {
      current = current[0];
    }
    return current.map(item => Number(item) || 0);
  }

  if (ArrayBuffer.isView(value.data)) {
    return Array.from(value.data, Number);
  }

  return [];
}

function scoreQuantizedEmbedding(queryVector, encodedVector, scale = 127) {
  if (!Array.isArray(encodedVector) || !queryVector.length) {
    return null;
  }

  const vectorLength = Math.min(queryVector.length, encodedVector.length);
  if (vectorLength === 0) {
    return null;
  }

  let score = 0;
  for (let index = 0; index < vectorLength; index += 1) {
    score += queryVector[index] * (Number(encodedVector[index]) / scale);
  }

  return score;
}

function scoreQuantizedMultiEmbeddings(queryVector, vectorEntries, scale = 127, slotWeights = {}) {
  if (!Array.isArray(vectorEntries) || !queryVector.length) {
    return null;
  }

  let bestScore = null;

  vectorEntries.forEach(entry => {
    const slot = entry?.slot || '';
    const rawEmbedding = Array.isArray(entry?.embedding) ? entry.embedding : entry;
    const score = scoreQuantizedEmbedding(queryVector, rawEmbedding, scale);
    if (!Number.isFinite(score)) {
      return;
    }

    const weightedScore = score * (Number(slotWeights?.[slot]) || 1);
    if (bestScore === null || weightedScore > bestScore) {
      bestScore = weightedScore;
    }
  });

  return bestScore;
}

function ensureSemanticPrefix(text, prefix) {
  const rawText = String(text || '').trim();
  const rawPrefix = String(prefix || '').trim();

  if (!rawPrefix) {
    return rawText;
  }

  const compactPrefix = rawPrefix;
  const canonicalPrefix = compactPrefix.endsWith(' ') ? compactPrefix : `${compactPrefix} `;

  if (!rawText) {
    return compactPrefix;
  }

  if (rawText.toLowerCase().startsWith(compactPrefix.toLowerCase())) {
    const suffix = rawText.slice(compactPrefix.length).trimStart();
    return suffix ? `${canonicalPrefix}${suffix}` : compactPrefix;
  }

  return `${canonicalPrefix}${rawText}`;
}

function prepareSemanticQuery(question, modelConfig = null) {
  const rawQuestion = String(question || '').trim();
  if (!rawQuestion) {
    return '';
  }

  if (modelConfig?.usage === 'asymmetric_retrieval') {
    return ensureSemanticPrefix(rawQuestion, modelConfig.queryPrefix || 'query: ');
  }

  return rawQuestion;
}

export function createSemanticRagRuntime({
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
  createRemoteQueryEncoder = null,
  logger = console
}) {
  let loadPromise = null;

  async function resolveWebGPUStatus() {
    if (typeof getWebGPUStatus === 'function') {
      try {
        const status = await getWebGPUStatus();
        if (status && typeof status === 'object') {
          return status;
        }
      } catch (error) {
        logger.warn('Vérification WebGPU indisponible pour le RAG sémantique.', error);
      }
    }

    const supported = hasWebGPU();
    return {
      supported,
      adapterAvailable: supported,
      reason: supported ? 'unknown' : 'unsupported',
      message: supported ? '' : 'WebGPU n est pas disponible sur cet appareil.'
    };
  }

  function getWebGPUBlockingMessage(status) {
    if (!status?.supported) {
      return 'Le RAG sémantique local requiert WebGPU sur cet appareil.';
    }

    return `${status?.message || "Aucun adaptateur GPU compatible n'est disponible pour le RAG sémantique local."} Le téléchargement du modèle d'embedding n'a pas été lancé.`;
  }

  function getSelectedMode() {
    return getStoredValue(storageKeys.semanticRagMode) || appState.semanticIndexMode || DEFAULT_SEMANTIC_MODE;
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

  async function releaseSemanticRag() {
    if (appState.semanticEncoder && typeof appState.semanticEncoder.dispose === 'function') {
      await appState.semanticEncoder.dispose();
    }

    appState.semanticEncoder = null;
    appState.semanticModelConfig = null;
    appState.semanticIndexMode = getSelectedMode();
    appState.semanticRagStatus = 'disabled';
  }

  async function loadSemanticRag(requestedMode = getSelectedMode()) {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      const config = await getSemanticSearchConfig(requestedMode);
      const isRemoteQueryMode = config?.model?.queryMode === 'remote';
      if (!config?.available || (!config?.model?.browserModelId && !isRemoteQueryMode)) {
        appState.semanticRagStatus = 'unavailable';
        addSystemMessage("Le RAG sémantique local sélectionné n'est pas encore disponible dans les artefacts publics.");
        return false;
      }

      // Le mode a requete distante n'a besoin ni de WebGPU ni d'un telechargement
      // de modele : la question est encodee par le Worker en ligne.
      if (!isRemoteQueryMode) {
        const webGPUStatus = await resolveWebGPUStatus();
        if (!webGPUStatus.adapterAvailable) {
          appState.semanticRagStatus = 'error';
          addSystemMessage(getWebGPUBlockingMessage(webGPUStatus));
          return false;
        }
      }

      appState.semanticRagStatus = 'loading';
      appState.semanticIndexMode = config.modeId || requestedMode;

      const semanticIndexReady = await ensureSemanticIndexReady(config.modeId || requestedMode);
      if (!semanticIndexReady) {
        appState.semanticRagStatus = 'error';
        addSystemMessage("Impossible de charger l'index sémantique local pour ce mode.");
        return false;
      }

      if (
        appState.semanticEncoder &&
        appState.semanticModelConfig?.queryMode === config.model.queryMode &&
        appState.semanticModelConfig?.browserModelId === config.model.browserModelId &&
        appState.semanticModelConfig?.modeId === config.modeId
      ) {
        appState.semanticRagStatus = 'ready';
        return true;
      }

      try {
        if (isRemoteQueryMode) {
          await releaseSemanticRag();
          const remoteEncoder = typeof createRemoteQueryEncoder === 'function'
            ? createRemoteQueryEncoder(config.model)
            : null;

          if (!remoteEncoder) {
            appState.semanticRagStatus = 'unavailable';
            addSystemMessage("Le service en ligne d'embedding n'est pas disponible ; le mode sémantique local reste utilisable.");
            return false;
          }

          appState.semanticEncoder = remoteEncoder;
        } else {
          const canReuseEncoder =
            appState.semanticEncoder &&
            appState.semanticModelConfig?.queryMode !== 'remote' &&
            appState.semanticModelConfig?.browserModelId === config.model.browserModelId;

          if (!canReuseEncoder) {
            await releaseSemanticRag();
            await transformersRuntime.loadRuntime('stable');
            appState.semanticEncoder = await transformersRuntime.state.pipeline(
              config.model.task || 'feature-extraction',
              config.model.browserModelId,
              {
                device: 'webgpu'
              }
            );
          }
        }

        appState.semanticModelConfig = {
          ...config.model,
          modeId: config.modeId,
          label: config.label,
          strategy: config.strategy,
          experimental: config.experimental === true
        };
        appState.semanticIndexMode = config.modeId || requestedMode;
        appState.semanticRagStatus = 'ready';
        setStoredValue(storageKeys.acceptedEmbeddingModelId, config.model.id || config.model.browserModelId);
        addSystemMessage(`RAG sémantique prêt : ${config.label || config.modeId}.`);
        return true;
      } catch (error) {
        logger.error("Erreur de chargement du modèle d'embedding:", error);
        await releaseSemanticRag();
        appState.semanticRagStatus = 'error';
        addSystemMessage(`Erreur de chargement du RAG sémantique : ${error?.message || error}`);
        return false;
      }
    })();

    try {
      return await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  async function buildSemanticScores(question, votes, getVoteId) {
    if (!isEnabled() || !isReady() || typeof getVoteId !== 'function') {
      return new Map();
    }

    const activeMode = appState.semanticModelConfig?.modeId || getSelectedMode();
    const semanticIndex = getSemanticIndex(activeMode);
    if (!semanticIndex?.votes) {
      return new Map();
    }

    const preparedQuestion = prepareSemanticQuery(question, appState.semanticModelConfig);
    const queryEmbedding = flattenEmbeddingOutput(await appState.semanticEncoder(preparedQuestion, {
      pooling: appState.semanticModelConfig?.pooling || 'mean',
      normalize: appState.semanticModelConfig?.normalize !== false
    }));

    if (!queryEmbedding.length) {
      return new Map();
    }

    const scale = Number(
      semanticIndex?.model?.vector_scale ||
      semanticIndex?.model?.vectorScale ||
      127
    );
    const slotWeights =
      semanticIndex?.model?.slot_weights ||
      semanticIndex?.model?.slotWeights ||
      {};
    const scores = new Map();

    votes.forEach(vote => {
      const voteId = String(getVoteId(vote) || '');
      if (!voteId) {
        return;
      }

      const encodedVote = semanticIndex?.votes?.[voteId];
      let score = null;

      if (Array.isArray(encodedVote?.vectors)) {
        score = scoreQuantizedMultiEmbeddings(queryEmbedding, encodedVote.vectors, scale, slotWeights);
      } else {
        score = scoreQuantizedEmbedding(queryEmbedding, encodedVote?.embedding, scale);
      }

      if (Number.isFinite(score)) {
        scores.set(voteId, score);
      }
    });

    return scores;
  }

  return {
    buildSemanticScores,
    getSelectedMode,
    getStatus,
    isEnabled,
    isReady,
    loadSemanticRag,
    releaseSemanticRag
  };
}
