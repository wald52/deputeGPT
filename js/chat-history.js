/**
 * Module de gestion de l'historique des chats avec IndexedDB
 * Persistance longue durée pour les sessions de chat
 */

const CHAT_HISTORY_DB_NAME = 'deputegpt-chat-history';
const CHAT_HISTORY_DB_VERSION = 1;
const CHAT_HISTORY_STORE_NAME = 'sessions';

let chatHistoryDb = null;

/**
 * Structure d'une session de chat:
 * {
 *   id: string (UUID),
 *   createdAt: ISO string,
 *   updatedAt: ISO string,
 *   deputeId: string,
 *   deputeName: string,
 *   deputeGroupe: string,
 *   modelId: string | null,
 *   modelName: string | null,
 *   messages: [
 *     {
 *       id: string,
 *       timestamp: ISO string,
 *       role: 'user' | 'assistant' | 'system',
 *       content: string,
 *       method: 'deterministic' | 'analysis_rag' | 'clarify' | 'system' | null,
 *       metadata: {
 *         voteIds: string[] | null,
 *         allVoteIds: string[] | null,
 *         displayedVoteIds: string[] | null,
 *         references: object[] | null,
 *         filters: object | null,
 *         sort: string | null,
 *         limit: number | null,
 *         listMode: string | null,
 *         pageSize: number | null,
 *         theme: string | null,
 *         dateRange: object | null
 *       }
 *     }
 *   ],
 *   sessionState: {
 *     activeDeputeId: string,
 *     lastResultVoteIds: string[],
 *     lastResultQuery: string,
 *     lastFilters: object | null,
 *     lastSort: string,
 *     lastLimit: number | null,
 *     lastScopeSource: string | null,
 *     lastTheme: string | null,
 *     lastDateRange: object | null,
 *     lastPlan: object | null,
 *     pendingClarification: object | null
 *   }
 * }
 */

async function openChatHistoryDb() {
  if (chatHistoryDb) {
    return chatHistoryDb;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHAT_HISTORY_DB_NAME, CHAT_HISTORY_DB_VERSION);

    request.onerror = () => {
      console.error('Impossible d\'ouvrir IndexedDB pour l\'historique des chats:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      chatHistoryDb = request.result;
      console.debug('✅ Base de données d\'historique des chats ouverte.');
      resolve(chatHistoryDb);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(CHAT_HISTORY_STORE_NAME)) {
        const store = db.createObjectStore(CHAT_HISTORY_STORE_NAME, { keyPath: 'id' });
        store.createIndex('deputeId', 'deputeId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        console.debug('📦 Object store "sessions" créé pour l\'historique des chats.');
      }
    };
  });
}

function generateSessionId() {
  return `session-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11)}`;
}

function generateMessageId() {
  return `msg-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11)}`;
}

async function createSession(depute, modelConfig = null) {
  const db = await openChatHistoryDb();

  const session = {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deputeId: depute?.id || null,
    deputeName: depute ? `${depute.prenom} ${depute.nom}` : null,
    deputeGroupe: depute?.groupe || depute?.groupeNom || null,
    modelId: modelConfig?.id || null,
    modelName: modelConfig?.displayName || null,
    messages: [],
    sessionState: {
      activeDeputeId: depute?.id || null,
      lastResultVoteIds: [],
      lastResultQuery: '',
      lastFilters: null,
      lastSort: 'date_desc',
      lastLimit: null,
      lastScopeSource: 'depute_all',
      lastTheme: null,
      lastDateRange: null,
      lastPlan: null,
      pendingClarification: null
    }
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const request = store.add(session);

    request.onsuccess = () => {
      console.debug(`📝 Nouvelle session créée: ${session.id}`);
      resolve(session);
    };

    request.onerror = () => {
      console.error('Erreur lors de la création de la session:', request.error);
      reject(request.error);
    };
  });
}

async function updateSession(sessionId, updates) {
  const db = await openChatHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const getRequest = store.get(sessionId);

    getRequest.onsuccess = () => {
      const session = getRequest.result;
      if (!session) {
        reject(new Error(`Session ${sessionId} non trouvée`));
        return;
      }

      const updatedSession = {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const putRequest = store.put(updatedSession);
      putRequest.onsuccess = () => resolve(updatedSession);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function addMessageToSession(sessionId, message) {
  const db = await openChatHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const getRequest = store.get(sessionId);

    getRequest.onsuccess = () => {
      const session = getRequest.result;
      if (!session) {
        reject(new Error(`Session ${sessionId} non trouvée`));
        return;
      }

      const newMessage = {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        ...message
      };

      session.messages.push(newMessage);
      session.updatedAt = new Date().toISOString();

      const putRequest = store.put(session);
      putRequest.onsuccess = () => resolve(newMessage);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function updateSessionState(sessionId, sessionState) {
  return updateSession(sessionId, { sessionState });
}

async function getSession(sessionId) {
  const db = await openChatHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const request = store.get(sessionId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function getAllSessions(options = {}) {
  const db = await openChatHistoryDb();
  const { limit = 50, offset = 0, deputeId = null } = options;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const index = deputeId ? store.index('deputeId') : store.index('updatedAt');
    const request = index.openCursor(null, 'prev');

    const sessions = [];
    let skipped = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;

      if (!cursor) {
        resolve(sessions);
        return;
      }

      const session = cursor.value;

      // Filtrer par deputeId si spécifié (quand on n'utilise pas l'index)
      if (deputeId && !options.useDeputeIndex) {
        if (session.deputeId !== deputeId) {
          cursor.continue();
          return;
        }
      }

      if (skipped < offset) {
        skipped++;
        cursor.continue();
        return;
      }

      sessions.push(session);

      if (sessions.length >= limit) {
        resolve(sessions);
        return;
      }

      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

async function deleteSession(sessionId) {
  const db = await openChatHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const request = store.delete(sessionId);

    request.onsuccess = () => {
      console.debug(`🗑️ Session supprimée: ${sessionId}`);
      resolve(true);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteAllSessions() {
  const db = await openChatHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.debug('🗑️ Toutes les sessions ont été supprimées.');
      resolve(true);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Exporte toutes les sessions en format JSON pour RAG
 * Format optimisé pour le traitement ultérieur
 */
async function exportSessionsForRag(options = {}) {
  const { deputeId = null, format = 'json' } = options;
  const sessions = await getAllSessions({ limit: 1000, deputeId });

  if (format === 'jsonl') {
    // Format JSONL (une ligne par session) - idéal pour le traitement streaming
    return sessions.map(session => JSON.stringify({
      id: session.id,
      createdAt: session.createdAt,
      depute: {
        id: session.deputeId,
        name: session.deputeName,
        groupe: session.deputeGroupe
      },
      model: session.modelName,
      messages: session.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        method: msg.method,
        timestamp: msg.timestamp,
        metadata: msg.metadata
      })),
      sessionState: session.sessionState
    })).join('\n');
  }

  // Format JSON complet
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    totalSessions: sessions.length,
    sessions: sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      depute: {
        id: session.deputeId,
        name: session.deputeName,
        groupe: session.deputeGroupe
      },
      model: session.modelId ? {
        id: session.modelId,
        name: session.modelName
      } : null,
      messages: session.messages.map(msg => ({
        id: msg.id,
        timestamp: msg.timestamp,
        role: msg.role,
        content: msg.content,
        method: msg.method,
        metadata: msg.metadata
      })),
      sessionState: session.sessionState
    }))
  };
}

/**
 * Télécharge l'export en fichier
 */
async function downloadExport(options = {}) {
  const { filename = null, format = 'json' } = options;
  const data = await exportSessionsForRag(options);

  const mimeType = format === 'jsonl' ? 'application/x-ndjson' : 'application/json';
  const extension = format === 'jsonl' ? 'jsonl' : 'json';
  const defaultFilename = `deputegpt-chats-${new Date().toISOString().slice(0, 10)}.${extension}`;

  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.debug(`📥 Export téléchargé: ${link.download}`);
}

/**
 * Obtient un résumé des sessions pour l'affichage UI
 */
async function getSessionsSummary() {
  const sessions = await getAllSessions({ limit: 100 });

  return sessions.map(session => ({
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    deputeName: session.deputeName,
    deputeGroupe: session.deputeGroupe,
    messageCount: session.messages.length,
    modelName: session.modelName,
    preview: session.messages.length > 0
      ? session.messages[session.messages.length - 1].content.slice(0, 100) + '...'
      : 'Aucun message'
  }));
}

/**
 * Obtient la session active ou en crée une nouvelle
 */
let activeSessionId = null;

async function getOrCreateActiveSession(depute, modelConfig = null) {
  if (activeSessionId) {
    const existingSession = await getSession(activeSessionId);
    if (existingSession && existingSession.deputeId === depute?.id) {
      return existingSession;
    }
  }

  const newSession = await createSession(depute, modelConfig);
  activeSessionId = newSession.id;
  return newSession;
}

function setActiveSessionId(sessionId) {
  activeSessionId = sessionId;
}

function getActiveSessionId() {
  return activeSessionId;
}

function clearActiveSession() {
  activeSessionId = null;
}

// API publique
window.ChatHistory = {
  // Gestion des sessions
  createSession,
  updateSession,
  getSession,
  getAllSessions,
  deleteSession,
  deleteAllSessions,

  // Messages
  addMessageToSession,
  updateSessionState,

  // Session active
  getOrCreateActiveSession,
  setActiveSessionId,
  getActiveSessionId,
  clearActiveSession,

  // Export
  exportSessionsForRag,
  downloadExport,

  // UI helpers
  getSessionsSummary,

  // Initialisation
  init: openChatHistoryDb
};
