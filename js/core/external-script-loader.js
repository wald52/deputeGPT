const scriptLoadPromises = new Map();

function resolveScriptUrl(src, documentRef = globalThis.document) {
  return new URL(src, documentRef?.baseURI || globalThis.location?.href || src).toString();
}

function resolveGlobalValue(globalName) {
  if (!globalName) {
    return true;
  }

  return globalThis[globalName];
}

export async function loadExternalScript(src, {
  documentRef = globalThis.document,
  globalName = null
} = {}) {
  const resolvedGlobalValue = resolveGlobalValue(globalName);
  if (resolvedGlobalValue) {
    return resolvedGlobalValue;
  }

  if (!documentRef?.createElement || !documentRef?.head) {
    return null;
  }

  const resolvedSrc = resolveScriptUrl(src, documentRef);
  if (scriptLoadPromises.has(resolvedSrc)) {
    return scriptLoadPromises.get(resolvedSrc);
  }

  const pendingLoad = new Promise((resolve, reject) => {
    let script = documentRef.querySelector(`script[src="${resolvedSrc}"]`);
    const cleanup = () => {
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      cleanup();
      const loadedValue = resolveGlobalValue(globalName);
      if (!loadedValue) {
        reject(new Error(`Le script ${resolvedSrc} est charge, mais ${globalName || 'la dependance attendue'} reste indisponible.`));
        return;
      }

      resolve(loadedValue);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Impossible de charger le script externe ${resolvedSrc}.`));
    };

    if (!script) {
      script = documentRef.createElement('script');
      script.src = resolvedSrc;
      script.async = true;
      script.crossOrigin = 'anonymous';
      documentRef.head.appendChild(script);
    }

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  });

  scriptLoadPromises.set(resolvedSrc, pendingLoad);

  try {
    return await pendingLoad;
  } catch (error) {
    scriptLoadPromises.delete(resolvedSrc);
    throw error;
  }
}
