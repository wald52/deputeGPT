import { describe, it, expect, vi } from 'vitest';
import {
  createOnlineSessionClient,
  getCachedSessionToken,
  getCachedCapabilities,
  clearStoredSession,
  SESSION_TOKEN_KEY,
  SESSION_EXPIRY_KEY,
  SESSION_CAPABILITIES_KEY
} from './online-session.js';

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    _store: store
  };
}

describe('online-session', () => {
  it('reutilise un jeton en cache valide sans appel reseau', async () => {
    const now = () => 1000000;
    const storage = createMockStorage({
      [SESSION_TOKEN_KEY]: 'jeton-valide',
      [SESSION_EXPIRY_KEY]: new Date(1000000 + 60000).toISOString()
    });
    const fetchImpl = vi.fn();
    const client = createOnlineSessionClient({
      apiBaseUrl: 'https://worker.example',
      fetchImpl,
      storageApi: storage,
      now
    });

    await expect(client.ensureSessionToken()).resolves.toBe('jeton-valide');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.getCachedSessionToken()).toBe('jeton-valide');
  });

  it('ignore un jeton expirant dans moins de 30 secondes', () => {
    const now = () => 1000000;
    const storage = createMockStorage({
      [SESSION_TOKEN_KEY]: 'jeton-perime',
      [SESSION_EXPIRY_KEY]: new Date(1000000 + 20000).toISOString()
    });

    expect(getCachedSessionToken(storage, now)).toBeNull();
  });

  it('persiste jeton, expiration et capabilities apres /session', async () => {
    const now = () => 0;
    const storage = createMockStorage();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        session_token: 'nouveau-jeton',
        expires_at: new Date(3600000).toISOString(),
        capabilities: { rerank: true, embed_query: false }
      })
    }));
    const client = createOnlineSessionClient({
      apiBaseUrl: 'https://worker.example/',
      fetchImpl,
      storageApi: storage,
      now
    });

    await expect(client.ensureSessionToken()).resolves.toBe('nouveau-jeton');
    expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/session', expect.any(Object));
    expect(client.getCapabilities()).toEqual({ rerank: true, embed_query: false });
  });

  it('conserve les anciennes capabilities si /session n en renvoie pas', async () => {
    const storage = createMockStorage({
      [SESSION_CAPABILITIES_KEY]: JSON.stringify({ rerank: true, embed_query: true })
    });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        session_token: 'jeton',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      })
    }));
    const client = createOnlineSessionClient({
      apiBaseUrl: 'https://worker.example',
      fetchImpl,
      storageApi: storage
    });

    await client.ensureSessionToken();
    expect(client.getCapabilities()).toEqual({ rerank: true, embed_query: true });
  });

  it('propage une erreur structuree quand /session echoue', async () => {
    const storage = createMockStorage();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error_code: 'RATE_LIMITED', message: 'Trop de demandes.', next_action: 'wait' })
    }));
    const client = createOnlineSessionClient({
      apiBaseUrl: 'https://worker.example',
      fetchImpl,
      storageApi: storage
    });

    await expect(client.ensureSessionToken()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      nextAction: 'wait',
      responseStatus: 429
    });
  });

  it('clearStoredSession supprime jeton et expiration mais pas les capabilities', () => {
    const storage = createMockStorage({
      [SESSION_TOKEN_KEY]: 'jeton',
      [SESSION_EXPIRY_KEY]: 'demain',
      [SESSION_CAPABILITIES_KEY]: JSON.stringify({ rerank: true })
    });

    clearStoredSession(storage);
    expect(storage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(SESSION_EXPIRY_KEY)).toBeNull();
    expect(getCachedCapabilities(storage)).toEqual({ rerank: true });
  });

  it('getCachedCapabilities tolere un JSON corrompu', () => {
    const storage = createMockStorage({ [SESSION_CAPABILITIES_KEY]: '{invalide' });
    expect(getCachedCapabilities(storage)).toBeNull();
  });
});
