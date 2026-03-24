function defaultIsStandalone(windowObject, navigatorObject) {
  const displayMode = windowObject.matchMedia?.('(display-mode: standalone)');
  return Boolean(displayMode?.matches || navigatorObject?.standalone === true);
}

function defaultShouldOfferIosInstall(windowObject, navigatorObject) {
  const userAgent = String(navigatorObject?.userAgent || '').toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);
  return isIos && isSafari && !defaultIsStandalone(windowObject, navigatorObject);
}

async function defaultRegisterServiceWorker({ navigatorObject }) {
  return navigatorObject.serviceWorker.register('./sw.js', { scope: './' });
}

export function createPwaController({
  windowObject = window,
  documentObject = document,
  navigatorObject = navigator,
  registerServiceWorker = defaultRegisterServiceWorker,
  reloadPage = () => windowObject.location.reload()
} = {}) {
  const canRegisterServiceWorker = Boolean(
    navigatorObject?.serviceWorker && typeof registerServiceWorker === 'function'
  );

  let installPromptEvent = null;
  let installMode = defaultShouldOfferIosInstall(windowObject, navigatorObject) ? 'ios' : 'none';
  let showIosHelp = false;
  let serviceWorkerReady = false;
  let updateReady = false;
  let isApplyingUpdate = false;
  let isOffline = navigatorObject?.onLine === false;
  let isStandalone = defaultIsStandalone(windowObject, navigatorObject);
  let shouldReloadAfterUpdate = false;
  let registration = null;
  let dismissedStateKey = '';

  const elements = {
    root: null,
    statusText: null,
    statusHelp: null,
    installButton: null,
    updateButton: null,
    dismissButton: null
  };

  function readElements() {
    elements.root = documentObject.getElementById('pwa-toolbar');
    elements.statusText = documentObject.getElementById('pwa-status-text');
    elements.statusHelp = documentObject.getElementById('pwa-status-help');
    elements.installButton = documentObject.getElementById('pwa-install-btn');
    elements.updateButton = documentObject.getElementById('pwa-update-btn');
    elements.dismissButton = documentObject.getElementById('pwa-dismiss-btn');
  }

  function getBannerStateKey() {
    if (updateReady) {
      return 'update_ready';
    }

    if (isOffline) {
      return 'offline';
    }

    if (isStandalone) {
      return 'installed';
    }

    if (installMode === 'prompt' || installMode === 'ios') {
      return `install_${installMode}`;
    }

    if (serviceWorkerReady || canRegisterServiceWorker) {
      return 'offline_ready';
    }

    return '';
  }

  function shouldShowRoot(stateKey = getBannerStateKey()) {
    return Boolean(
      elements.root &&
      stateKey &&
      dismissedStateKey !== stateKey
    );
  }

  function computeStatusText() {
    if (updateReady) {
      return isApplyingUpdate ? 'Activation de la mise a jour...' : 'Mise a jour disponible.';
    }

    if (isOffline) {
      return 'Hors ligne partiel. IA en ligne indisponible.';
    }

    if (isStandalone) {
      return 'Application installee. Hors ligne partiel disponible.';
    }

    if (installMode === 'prompt' || installMode === 'ios') {
      return "Installer l'application";
    }

    if (serviceWorkerReady || canRegisterServiceWorker) {
      return 'Hors ligne partiel disponible.';
    }

    return '';
  }

  function render() {
    if (!elements.root) {
      return;
    }

    const stateKey = getBannerStateKey();
    const showInstallButton = installMode === 'prompt' || installMode === 'ios';

    elements.root.hidden = !shouldShowRoot(stateKey);

    if (elements.statusText) {
      elements.statusText.textContent = computeStatusText();
    }

    if (elements.statusHelp) {
      elements.statusHelp.hidden = !(installMode === 'ios' && showIosHelp);
      elements.statusHelp.textContent = 'Sur iPhone ou iPad, utilisez Partager puis Ajouter a l ecran d accueil.';
    }

    if (elements.installButton) {
      elements.installButton.hidden = !showInstallButton;
      elements.installButton.disabled = false;
      elements.installButton.textContent = installMode === 'ios'
        ? 'Ajouter a l ecran d accueil'
        : 'Installer l app';
    }

    if (elements.updateButton) {
      elements.updateButton.hidden = !updateReady;
      elements.updateButton.disabled = isApplyingUpdate;
      elements.updateButton.textContent = isApplyingUpdate ? 'Activation...' : 'Actualiser';
    }
  }

  function dismissBanner() {
    const stateKey = getBannerStateKey();
    if (!stateKey) {
      return false;
    }

    dismissedStateKey = stateKey;
    showIosHelp = false;
    render();
    return true;
  }

  function setOfflineState(nextOffline) {
    isOffline = nextOffline;
    render();
  }

  function showUpdateReady(nextRegistration = registration) {
    registration = nextRegistration || registration;
    updateReady = Boolean(registration?.waiting);
    isApplyingUpdate = false;
    render();
  }

  function syncStandaloneState() {
    isStandalone = defaultIsStandalone(windowObject, navigatorObject);
    if (isStandalone) {
      installPromptEvent = null;
      installMode = 'installed';
      showIosHelp = false;
    }
    render();
  }

  function attachWorkerState(worker) {
    if (!worker?.addEventListener) {
      return;
    }

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigatorObject?.serviceWorker?.controller) {
        showUpdateReady(registration);
      }
    });
  }

  function monitorRegistration(nextRegistration) {
    registration = nextRegistration;

    if (registration?.installing) {
      attachWorkerState(registration.installing);
    }

    if (registration?.addEventListener) {
      registration.addEventListener('updatefound', () => {
        attachWorkerState(registration.installing);
      });
    }

    if (registration?.waiting && navigatorObject?.serviceWorker?.controller) {
      showUpdateReady(registration);
    }
  }

  async function requestUpdateActivation() {
    if (!registration?.waiting || typeof registration.waiting.postMessage !== 'function') {
      return false;
    }

    isApplyingUpdate = true;
    shouldReloadAfterUpdate = true;
    render();
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  async function handleInstallClick() {
    if (installMode === 'ios') {
      showIosHelp = !showIosHelp;
      render();
      return true;
    }

    if (!installPromptEvent) {
      return false;
    }

    const promptEvent = installPromptEvent;
    installPromptEvent = null;
    installMode = 'none';
    showIosHelp = false;
    render();

    await promptEvent.prompt?.();

    try {
      const userChoice = await promptEvent.userChoice;
      if (userChoice?.outcome !== 'accepted') {
        installPromptEvent = promptEvent;
        installMode = 'prompt';
      }
    } catch (error) {
      installPromptEvent = promptEvent;
      installMode = 'prompt';
    }

    render();
    return true;
  }

  async function handlePrimaryButtonClick() {
    if (updateReady) {
      return requestUpdateActivation();
    }
    return handleInstallClick();
  }

  function handleBeforeInstallPrompt(event) {
    event.preventDefault?.();
    installPromptEvent = event;
    installMode = 'prompt';
    showIosHelp = false;
    render();
  }

  function handleAppInstalled() {
    installPromptEvent = null;
    installMode = 'installed';
    showIosHelp = false;
    syncStandaloneState();
  }

  async function initServiceWorker() {
    if (!canRegisterServiceWorker) {
      render();
      return null;
    }

    navigatorObject.serviceWorker?.addEventListener?.('controllerchange', () => {
      serviceWorkerReady = true;
      render();

      if (shouldReloadAfterUpdate) {
        shouldReloadAfterUpdate = false;
        reloadPage();
      }
    });

    navigatorObject.serviceWorker?.addEventListener?.('message', event => {
      const eventType = event?.data?.type;
      if (eventType === 'PWA_UPDATE_READY' && registration?.waiting) {
        showUpdateReady(registration);
      }
    });

    try {
      const nextRegistration = await registerServiceWorker({
        windowObject,
        navigatorObject
      });
      serviceWorkerReady = true;
      monitorRegistration(nextRegistration);
    } catch (error) {
      console.warn('Impossible d enregistrer le service worker PWA.', error);
    }

    render();
    return registration;
  }

  async function init() {
    readElements();
    if (!elements.root) {
      return null;
    }

    render();

    windowObject.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    windowObject.addEventListener('appinstalled', handleAppInstalled);
    windowObject.addEventListener('online', () => setOfflineState(false));
    windowObject.addEventListener('offline', () => setOfflineState(true));
    windowObject.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', syncStandaloneState);

    elements.installButton?.addEventListener('click', handlePrimaryButtonClick);
    elements.updateButton?.addEventListener('click', requestUpdateActivation);
    elements.dismissButton?.addEventListener('click', dismissBanner);

    return initServiceWorker();
  }

  return {
    init,
    showUpdateReady,
    requestUpdateActivation
  };
}
