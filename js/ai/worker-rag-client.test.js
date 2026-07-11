import { describe, it, expect, vi } from 'vitest';
import { createWorkerRagClient } from './worker-rag-client.js';

function createMockSession({
  capabilities = { rerank: true, embed_query: true },
  token = 'jeton-en-cache'
} = {}) {
  return {
    getCapabilities: vi.fn(() => capabilities),
    getCachedSessionToken: vi.fn(() => token),
    clearSession: vi.fn()
  };
}

function createClient({ session = createMockSession(), fetchImpl, now = () => 0 } = {}) {
  return createWorkerRagClient({
    getOnlineContext: () => ({ apiBaseUrl: 'https://worker.example', session }),
    fetchImpl,
    now
  });
}

function okResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function errorResponse(status, payload = {}) {
  return { ok: false, status, json: async () => payload };
}

describe('worker-rag-client', () => {
  it('rerank nominal : Map index -> score', async () => {
    const fetchImpl = vi.fn(async () => okResponse({
      results: [{ index: 1, score: 0.9 }, { index: 0, score: 0.2 }]
    }));
    const client = createClient({ fetchImpl });

    const scores = await client.rerank('question', ['doc a', 'doc b']);

    expect(scores).toBeInstanceOf(Map);
    expect(scores.get(1)).toBe(0.9);
    expect(scores.get(0)).toBe(0.2);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://worker.example/rerank');
    expect(options.headers.Authorization).toBe('Bearer jeton-en-cache');
  });

  it('indisponible sans jeton de session en cache (jamais de fetch)', async () => {
    const session = createMockSession({ token: null });
    const fetchImpl = vi.fn();
    const client = createClient({ session, fetchImpl });

    expect(client.isRerankAvailable()).toBe(false);
    expect(await client.rerank('question', ['doc'])).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('indisponible quand la capability est absente', async () => {
    const session = createMockSession({ capabilities: { rerank: false, embed_query: true } });
    const client = createClient({ session, fetchImpl: vi.fn() });

    expect(client.isRerankAvailable()).toBe(false);
    expect(client.isEmbedQueryAvailable()).toBe(true);
  });

  it('indisponible sans contexte online actif', () => {
    const client = createWorkerRagClient({ getOnlineContext: () => null, fetchImpl: vi.fn() });
    expect(client.isRerankAvailable()).toBe(false);
  });

  it('FEATURE_DISABLED memorise pour la session', async () => {
    const fetchImpl = vi.fn(async () => errorResponse(503, { error_code: 'FEATURE_DISABLED' }));
    const client = createClient({ fetchImpl });

    expect(await client.rerank('question', ['doc'])).toBeNull();
    expect(client.isRerankAvailable()).toBe(false);
    expect(await client.rerank('question', ['doc'])).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401 purge la session stockee', async () => {
    const session = createMockSession();
    const fetchImpl = vi.fn(async () => errorResponse(401, { error_code: 'SESSION_INVALID' }));
    const client = createClient({ session, fetchImpl });

    expect(await client.rerank('question', ['doc'])).toBeNull();
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it('echec reseau -> null, et le breaker s ouvre apres 3 echecs', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('timeout');
    });
    const client = createClient({ fetchImpl });

    for (let i = 0; i < 3; i++) {
      expect(await client.rerank(`question ${i}`, ['doc'])).toBeNull();
    }

    expect(client.getCircuitStatus().status).toBe('open');
    expect(client.isRerankAvailable()).toBe(false);
    expect(await client.rerank('question suivante', ['doc'])).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('un refus quota (429) ne compte pas comme une panne du Worker', async () => {
    const fetchImpl = vi.fn(async () => errorResponse(429, { error_code: 'REMOTE_QUOTA_EXHAUSTED' }));
    const client = createClient({ fetchImpl });

    for (let i = 0; i < 4; i++) {
      expect(await client.rerank(`question ${i}`, ['doc'])).toBeNull();
    }

    expect(client.getCircuitStatus().status).toBe('closed');
  });

  it('cache de rerank par cle : un seul fetch pour deux appels identiques', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ results: [{ index: 0, score: 0.7 }] }));
    const client = createClient({ fetchImpl });

    const first = await client.rerank('question', ['doc'], { cacheKey: 'q::v1' });
    const second = await client.rerank('question', ['doc'], { cacheKey: 'q::v1' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.get(0)).toBe(0.7);
    expect(second).not.toBe(first);
  });

  it('tronque question et documents aux limites du Worker', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ results: [{ index: 0, score: 1 }] }));
    const client = createClient({ fetchImpl });

    await client.rerank('q'.repeat(700), ['d'.repeat(600)]);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.query.length).toBe(600);
    expect(body.documents[0].length).toBe(500);
  });

  it('embedQuery nominal + cache', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ embedding: [0.1, 0.2, 0.3], dimension: 3 }));
    const client = createClient({ fetchImpl });

    const first = await client.embedQuery('question');
    const second = await client.embedQuery('question');

    expect(first).toEqual([0.1, 0.2, 0.3]);
    expect(second).toEqual([0.1, 0.2, 0.3]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
  });

  it('embedQuery rejette un vecteur non exploitable', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ embedding: [0.1, 'oops', 0.3] }));
    const client = createClient({ fetchImpl });

    expect(await client.embedQuery('question')).toBeNull();
  });
});
