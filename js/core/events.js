export function createEventBus() {
  const listeners = new Map();

  return {
    on(eventName, listener) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(listener);
      return () => {
        listeners.get(eventName)?.delete(listener);
      };
    },
    emit(eventName, payload) {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      handlers.forEach(listener => {
        try {
          listener(payload);
        } catch (error) {
          console.error(`Erreur dans le handler "${eventName}":`, error);
        }
      });
    },
    clear(eventName = null) {
      if (eventName) {
        listeners.delete(eventName);
        return;
      }
      listeners.clear();
    }
  };
}

export const appEvents = createEventBus();
