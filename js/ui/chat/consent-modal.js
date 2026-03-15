const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function createConsentModalController({
  appState,
  formatDownloadSize,
  resolveThinkingModeFlag
}) {
  let lastFocusedElement = null;

  function fillConsentModal(modelConfig) {
    const modeLabel = resolveThinkingModeFlag(modelConfig) ? 'thinking' : 'non-thinking';
    document.getElementById('consent-model-name').textContent = modelConfig.displayName;
    document.getElementById('consent-model-profile').textContent = `${modelConfig.family} · ${modelConfig.status === 'stable' ? 'stable' : 'experimental'} · ${modeLabel}`;
    document.getElementById('consent-model-size').textContent = formatDownloadSize(modelConfig.estimatedDownloadMb);
    document.getElementById('consent-model-notes').textContent = modelConfig.notes;
  }

  function getDialogFocusableElements() {
    const dialog = document.querySelector('#model-consent-overlay .consent-dialog');
    if (!dialog) {
      return [];
    }

    return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => !element.hasAttribute('hidden'));
  }

  function handleOverlayKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideConsentModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getDialogFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function showConsentModal(modelConfig) {
    appState.pendingModelConfig = modelConfig;
    fillConsentModal(modelConfig);
    const overlay = document.getElementById('model-consent-overlay');
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.addEventListener('keydown', handleOverlayKeydown);

    const initialFocusTarget = document.getElementById('cancel-consent-btn');
    globalThis.requestAnimationFrame?.(() => {
      initialFocusTarget?.focus();
    });
  }

  function hideConsentModal() {
    appState.pendingModelConfig = null;
    const overlay = document.getElementById('model-consent-overlay');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeEventListener('keydown', handleOverlayKeydown);

    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    }

    lastFocusedElement = null;
  }

  return {
    fillConsentModal,
    showConsentModal,
    hideConsentModal
  };
}
