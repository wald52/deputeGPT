const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:8000',
  'http://localhost:8000'
];

const DEFAULT_SESSION_LIMIT = 6;
const DEFAULT_SESSION_WINDOW_SECONDS = 600;
const DEFAULT_ANALYSIS_LIMIT = 20;
const DEFAULT_ANALYSIS_WINDOW_SECONDS = 600;
const MAX_MESSAGE_COUNT = 8;
const MAX_TOTAL_CONTENT_LENGTH = 24000;
const MAX_COMPLETION_TOKENS = 512;

function parseInteger(value, fallbackValue) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseJsonEnvArray(value, fallbackValue = []) {
  if (!value) {
    return fallbackValue;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function getAllowedOrigins(env) {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }

  return DEFAULT_ALLOWED_ORIGINS;
}

function buildCorsHeaders(origin, env) {
  const allowedOrigins = getAllowedOrigins(env);
  const isAllowed = origin && allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function jsonResponse(payload, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders
    }
  });
}

function extractClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')
    || 'unknown';
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input || '')));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : new TextEncoder().encode(String(value));
  let binary = '';

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importSessionKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign', 'verify']
  );
}

async function signSessionPayload(payload, secret) {
  const signingKey = await importSessionKey(secret);
  const payloadString = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadString);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    new TextEncoder().encode(encodedPayload)
  );
  const signature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${encodedPayload}.${signature}`;
}

async function verifySessionToken(token, secret) {
  const [encodedPayload, encodedSignature] = String(token || '').split('.');
  if (!encodedPayload || !encodedSignature) {
    throw new Error('Jeton de session invalide.');
  }

  const signingKey = await importSessionKey(secret);
  const signatureBytes = base64UrlDecode(encodedSignature);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    signingKey,
    signatureBytes,
    new TextEncoder().encode(encodedPayload)
  );

  if (!isValid) {
    throw new Error('Signature de session invalide.');
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  if (!payload?.exp || Number(payload.exp) <= Date.now()) {
    throw new Error('Session expiree.');
  }

  return payload;
}

async function applyRateLimit(env, key, limit, windowSeconds) {
  if (!env.USAGE_LIMITER) {
    return { allowed: true };
  }

  const id = env.USAGE_LIMITER.idFromName(key);
  const stub = env.USAGE_LIMITER.get(id);
  const response = await stub.fetch('https://usage-limit.internal/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key,
      limit,
      windowSeconds
    })
  });

  if (!response.ok) {
    throw new Error('Le service de rate limit est indisponible.');
  }

  return response.json();
}

async function validateTurnstileToken(turnstileToken, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return;
  }

  if (!turnstileToken) {
    throw new Error('Turnstile requis.');
  }

  const siteVerifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: extractClientIp(request),
      idempotency_key: crypto.randomUUID()
    })
  });

  const siteVerifyPayload = await siteVerifyResponse.json();
  if (!siteVerifyResponse.ok || siteVerifyPayload?.success !== true) {
    throw new Error('Validation Turnstile refusee.');
  }
}

function extractBearerToken(request) {
  const authorizationHeader = request.headers.get('Authorization') || '';
  const [, token = ''] = authorizationHeader.match(/^Bearer\s+(.+)$/i) || [];
  return token.trim();
}

async function parseJsonRequest(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new Error('Corps JSON invalide.');
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Aucun message a transmettre.');
  }

  if (messages.length > MAX_MESSAGE_COUNT) {
    throw new Error('Trop de messages pour le service distant.');
  }

  const totalLength = messages.reduce((sum, message) => {
    if (!message || typeof message !== 'object') {
      return sum;
    }

    const content = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map(part => (typeof part === 'string' ? part : part?.text || '')).join(' ')
        : '';
    return sum + content.length;
  }, 0);

  if (totalLength > MAX_TOTAL_CONTENT_LENGTH) {
    throw new Error('Contexte trop volumineux pour le service distant.');
  }
}

function normalizeOnlineAnswer(payload) {
  const firstChoice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const messageContent = firstChoice?.message?.content;

  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map(part => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  if (typeof firstChoice?.text === 'string') {
    return firstChoice.text.trim();
  }

  return '';
}

function getRouteStepMeta(env, stepHeaderValue) {
  const stepIndex = Number.parseInt(String(stepHeaderValue ?? '0'), 10);
  const safeStepIndex = Number.isFinite(stepIndex) && stepIndex >= 0 ? stepIndex : 0;
  const steps = parseJsonEnvArray(env.AI_ROUTE_STEP_MAP, []);
  const stepConfig = steps[safeStepIndex] || null;

  return {
    fallbackCount: safeStepIndex,
    stepConfig
  };
}

async function runGatewayAnalysis(messages, body, env) {
  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_GATEWAY_ID}/compat/chat/completions`;
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-aig-authorization': `Bearer ${env.AI_GATEWAY_TOKEN}`
    },
    body: JSON.stringify({
      model: env.AI_GATEWAY_ROUTE || 'dynamic/deputegpt-analysis',
      messages,
      temperature: Number.isFinite(body.temperature) ? body.temperature : 0.2,
      top_p: Number.isFinite(body.top_p) ? body.top_p : 0.9,
      max_tokens: Math.min(
        Math.max(1, Math.round(Number.isFinite(body.max_tokens) ? body.max_tokens : 220)),
        MAX_COMPLETION_TOKENS
      )
    })
  });

  const responseText = await response.text();
  let payload = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const isQuotaLikeFailure = response.status === 429 || response.status === 402;
    return {
      ok: false,
      status: response.status,
      payload,
      errorCode: isQuotaLikeFailure ? 'REMOTE_QUOTA_EXHAUSTED' : 'REMOTE_UPSTREAM_ERROR',
      message: payload?.error?.message || payload?.message || `HTTP ${response.status}`
    };
  }

  return {
    ok: true,
    payload,
    provider: response.headers.get('cf-aig-provider') || null,
    model: response.headers.get('cf-aig-model') || null,
    step: response.headers.get('cf-aig-step') || '0'
  };
}

async function handleSessionRequest(request, env, corsHeaders) {
  const body = await parseJsonRequest(request);
  await validateTurnstileToken(body?.turnstile_token || null, request, env);

  const clientIp = extractClientIp(request);
  const origin = request.headers.get('Origin') || '';
  const userAgent = request.headers.get('User-Agent') || '';

  const rateLimitResult = await applyRateLimit(
    env,
    `session:${clientIp}`,
    parseInteger(env.SESSION_MAX_REQUESTS, DEFAULT_SESSION_LIMIT),
    parseInteger(env.SESSION_WINDOW_SECONDS, DEFAULT_SESSION_WINDOW_SECONDS)
  );

  if (rateLimitResult.allowed === false) {
    return jsonResponse({
      error_code: 'RATE_LIMITED',
      message: 'Trop de demandes de session. Reessayez dans quelques minutes.',
      next_action: 'wait'
    }, 429, corsHeaders);
  }

  const payload = {
    exp: Date.now() + 60 * 60 * 1000,
    origin,
    ip: await sha256Base64Url(clientIp),
    ua: await sha256Base64Url(userAgent)
  };
  const sessionToken = await signSessionPayload(payload, env.SESSION_SECRET);

  return jsonResponse({
    session_token: sessionToken,
    expires_at: new Date(payload.exp).toISOString()
  }, 200, corsHeaders);
}

async function handleAnalysisRequest(request, env, corsHeaders) {
  const token = extractBearerToken(request);
  if (!token) {
    return jsonResponse({
      error_code: 'SESSION_REQUIRED',
      message: 'Session manquante.',
      next_action: 'refresh_session'
    }, 401, corsHeaders);
  }

  let sessionPayload;
  try {
    sessionPayload = await verifySessionToken(token, env.SESSION_SECRET);
  } catch (error) {
    return jsonResponse({
      error_code: 'SESSION_INVALID',
      message: error.message,
      next_action: 'refresh_session'
    }, 401, corsHeaders);
  }

  const origin = request.headers.get('Origin') || '';
  if (sessionPayload.origin && origin && sessionPayload.origin !== origin) {
    return jsonResponse({
      error_code: 'SESSION_INVALID',
      message: 'Session non valide pour cette origine.',
      next_action: 'refresh_session'
    }, 403, corsHeaders);
  }

  const clientIp = extractClientIp(request);
  const userAgent = request.headers.get('User-Agent') || '';
  if (sessionPayload.ip && sessionPayload.ip !== await sha256Base64Url(clientIp)) {
    return jsonResponse({
      error_code: 'SESSION_INVALID',
      message: 'Session non valide pour cette adresse.',
      next_action: 'refresh_session'
    }, 403, corsHeaders);
  }

  if (sessionPayload.ua && sessionPayload.ua !== await sha256Base64Url(userAgent)) {
    return jsonResponse({
      error_code: 'SESSION_INVALID',
      message: 'Session non valide pour cet appareil.',
      next_action: 'refresh_session'
    }, 403, corsHeaders);
  }

  const analysisLimitResult = await applyRateLimit(
    env,
    `analysis:${clientIp}`,
    parseInteger(env.ANALYSIS_MAX_REQUESTS, DEFAULT_ANALYSIS_LIMIT),
    parseInteger(env.ANALYSIS_WINDOW_SECONDS, DEFAULT_ANALYSIS_WINDOW_SECONDS)
  );

  if (analysisLimitResult.allowed === false) {
    return jsonResponse({
      error_code: 'RATE_LIMITED',
      message: 'Trop de demandes d analyse pour cette session.',
      next_action: 'wait'
    }, 429, corsHeaders);
  }

  const body = await parseJsonRequest(request);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  validateMessages(messages);

  const upstreamResult = await runGatewayAnalysis(messages, body, env);
  if (!upstreamResult.ok) {
    return jsonResponse({
      error_code: upstreamResult.errorCode,
      message: upstreamResult.message,
      next_action: upstreamResult.errorCode === 'REMOTE_QUOTA_EXHAUSTED' ? 'activate_local' : 'retry'
    }, upstreamResult.status || 502, corsHeaders);
  }

  const answer = normalizeOnlineAnswer(upstreamResult.payload);
  if (!answer) {
    return jsonResponse({
      error_code: 'REMOTE_EMPTY_ANSWER',
      message: 'Le service distant n a renvoye aucune reponse exploitable.',
      next_action: 'retry'
    }, 502, corsHeaders);
  }

  const { fallbackCount, stepConfig } = getRouteStepMeta(env, upstreamResult.step);

  return jsonResponse({
    answer,
    provider: upstreamResult.provider || stepConfig?.provider || 'unknown',
    model: upstreamResult.model || stepConfig?.model || 'unknown',
    route: env.AI_GATEWAY_ROUTE || 'dynamic/deputegpt-analysis',
    fallback_count: fallbackCount,
    error_code: null,
    next_action: null
  }, 200, corsHeaders);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = buildCorsHeaders(origin, env);
    const allowedOrigins = getAllowedOrigins(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (!allowedOrigins.includes(origin)) {
      return jsonResponse({
        error_code: 'ORIGIN_FORBIDDEN',
        message: 'Origine non autorisee.',
        next_action: 'check_origin'
      }, 403, corsHeaders);
    }

    if (!env.SESSION_SECRET || !env.AI_GATEWAY_ACCOUNT_ID || !env.AI_GATEWAY_GATEWAY_ID || !env.AI_GATEWAY_TOKEN) {
      return jsonResponse({
        error_code: 'SERVER_NOT_CONFIGURED',
        message: 'Le Worker IA en ligne n est pas configure.',
        next_action: 'configure_worker'
      }, 500, corsHeaders);
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname.endsWith('/session')) {
        return await handleSessionRequest(request, env, corsHeaders);
      }

      if (request.method === 'POST' && url.pathname.endsWith('/analysis')) {
        return await handleAnalysisRequest(request, env, corsHeaders);
      }

      return jsonResponse({
        error_code: 'NOT_FOUND',
        message: 'Route introuvable.',
        next_action: null
      }, 404, corsHeaders);
    } catch (error) {
      return jsonResponse({
        error_code: 'INTERNAL_ERROR',
        message: error?.message || 'Erreur interne.',
        next_action: 'retry'
      }, 500, corsHeaders);
    }
  }
};

export class UsageLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const body = await request.json();
    const key = String(body?.key || '').trim();
    const limit = Math.max(1, parseInteger(body?.limit, DEFAULT_ANALYSIS_LIMIT));
    const windowSeconds = Math.max(10, parseInteger(body?.windowSeconds, DEFAULT_ANALYSIS_WINDOW_SECONDS));
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const bucketId = `${key}:${Math.floor(now / windowMs)}`;
    const stored = await this.state.storage.get(bucketId);
    const currentCount = Number.parseInt(String(stored?.count ?? 0), 10) || 0;

    if (currentCount >= limit) {
      return jsonResponse({
        allowed: false,
        remaining: 0
      }, 200);
    }

    await this.state.storage.put(
      bucketId,
      {
        count: currentCount + 1
      },
      {
        expirationTtl: windowSeconds + 60
      }
    );

    return jsonResponse({
      allowed: true,
      remaining: Math.max(0, limit - currentCount - 1)
    }, 200);
  }
}
