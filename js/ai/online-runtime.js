import { createCircuitBreaker } from './circuit-breaker.js';
import { createOnlineSessionClient, clearStoredSession } from './online-session.js';

function buildOnlineRequestBody(messages, options = {}, metadata = {}) {
  const body = {
    messages,
    metadata
  };

  const maxTokens = Number.isFinite(options.max_tokens)
    ? options.max_tokens
    : Number.isFinite(options.max_new_tokens)
      ? options.max_new_tokens
      : null;

  if (Number.isFinite(maxTokens)) {
    body.max_tokens = Math.max(1, Math.round(maxTokens));
  }

  ['temperature', 'top_p', 'top_k'].forEach(key => {
    const value = options[key];
    if (Number.isFinite(value)) {
      body[key] = value;
    }
  });

  return body;
}

async function consumeAnalysisEventStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let fullText = '';

  const handleDataLine = data => {
    if (!data || data === '[DONE]') {
      return;
    }

    let chunk = null;
    try {
      chunk = JSON.parse(data);
    } catch (error) {
      return;
    }

    const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : null;
    const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
    if (typeof delta === 'string' && delta) {
      fullText += delta;
      try {
        onToken(fullText, delta);
      } catch (error) {
        // Le rendu progressif ne doit jamais interrompre le flux.
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    let newlineIndex = buffered.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex).trim();
      buffered = buffered.slice(newlineIndex + 1);
      if (line.startsWith('data:')) {
        handleDataLine(line.slice(5).trim());
      }
      newlineIndex = buffered.indexOf('\n');
    }
  }

  const trailingLine = buffered.trim();
  if (trailingLine.startsWith('data:')) {
    handleDataLine(trailingLine.slice(5).trim());
  }

  return fullText.trim();
}

async function parseOnlineError(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  const message = payload?.message || payload?.error || payload?.error_message || `HTTP ${response.status}`;
  const error = new Error(message);
  error.code = payload?.error_code || payload?.code || null;
  error.nextAction = payload?.next_action || null;
  error.provider = payload?.provider || null;
  error.route = payload?.route || null;
  error.fallbackCount = Number.isFinite(payload?.fallback_count) ? payload.fallback_count : 0;
  error.responseStatus = response.status;
  return error;
}

export function createOnlineRuntime(
  modelConfig,
  {
    fetchImpl = globalThis.fetch,
    storageApi = globalThis.sessionStorage,
    now = () => Date.now()
  } = {}
) {
  const endpointBase = String(modelConfig?.apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!endpointBase) {
    throw new Error('Service IA en ligne non configure. Ajoutez l URL du Worker Cloudflare.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch est indisponible dans ce navigateur.');
  }

  const circuitBreaker = createCircuitBreaker(now);

  const sessionClient = createOnlineSessionClient({
    apiBaseUrl: endpointBase,
    turnstileSiteKey: modelConfig?.turnstileSiteKey,
    fetchImpl,
    storageApi,
    now,
    circuitBreaker
  });

  async function invoke(messages, options = {}) {
    circuitBreaker.checkBeforeCall();
    let sessionToken;
    try {
      sessionToken = await sessionClient.ensureSessionToken();
    } catch (error) {
      if (error?.code === 'CIRCUIT_OPEN') {
        throw error;
      }
      throw error;
    }

    try {
      const onToken = typeof options.onToken === 'function' ? options.onToken : null;
      const requestBody = buildOnlineRequestBody(messages, options, {
        source: 'deputegpt-web',
        model_signature: modelConfig?.signature || null
      });
      if (onToken) {
        requestBody.stream = true;
      }

      const response = await fetchImpl(`${endpointBase}/analysis`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearStoredSession(storageApi);
        }

        throw await parseOnlineError(response);
      }

      const contentType = String(response.headers?.get?.('Content-Type') || '');
      if (onToken && response.body && contentType.includes('text/event-stream')) {
        const answer = await consumeAnalysisEventStream(response, onToken);
        if (!answer) {
          const emptyStreamError = new Error('Le service distant n a renvoye aucune reponse exploitable.');
          emptyStreamError.code = 'REMOTE_EMPTY_ANSWER';
          throw emptyStreamError;
        }

        circuitBreaker.recordSuccess();
        const streamedMeta = {
          answer,
          provider: response.headers.get('x-deputegpt-provider') || 'unknown',
          model: response.headers.get('x-deputegpt-model') || 'unknown',
          route: response.headers.get('x-deputegpt-route') || null,
          fallback_count: Number.parseInt(response.headers.get('x-deputegpt-fallback-count') || '0', 10) || 0,
          error_code: null,
          next_action: null,
          streamed: true
        };
        return {
          choices: [
            {
              message: {
                content: answer
              }
            }
          ],
          deputeGPTMeta: streamedMeta
        };
      }

      const payload = await response.json();
      circuitBreaker.recordSuccess();
      return {
        choices: [
          {
            message: {
              content: payload?.answer || ''
            }
          }
        ],
        deputeGPTMeta: payload
      };
    } catch (error) {
      if (error?.code !== 'CIRCUIT_OPEN') {
        circuitBreaker.recordFailure();
      }
      throw error;
    }
  }

  return {
    invoke,
    session: sessionClient,
    getCircuitStatus() {
      return circuitBreaker.getStatus();
    },
    resetCircuit() {
      circuitBreaker.reset();
    },
    async dispose() {
      return undefined;
    }
  };
}
