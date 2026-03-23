import { stripLeadingFrenchArticle } from '../../domain/vote-title-display.js';

const VOTE_SOURCE_MODAL_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const DEFAULT_LOADING_TEXT = 'Chargement de la page de l’Assemblée…';
const DEFAULT_STATUS_TEXT = 'Si la page Assemblée reste vide ou partielle, ouvrez la source dans un nouvel onglet.';

export function createVoteSourceModalController() {
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  let detachFrameListeners = () => {};

  function getElements() {
    const overlay = document.getElementById('vote-source-overlay');

    return {
      overlay,
      dialog: overlay?.querySelector('.vote-source-dialog') || null,
      title: document.getElementById('vote-source-title'),
      meta: document.getElementById('vote-source-meta'),
      frame: document.getElementById('vote-source-frame'),
      loading: document.getElementById('vote-source-loading'),
      status: document.getElementById('vote-source-status'),
      link: document.getElementById('vote-source-link'),
      dismissButton: document.getElementById('dismiss-vote-source-btn')
    };
  }

  function getDialogFocusableElements() {
    const { dialog } = getElements();
    if (!dialog) {
      return [];
    }

    return Array.from(dialog.querySelectorAll(VOTE_SOURCE_MODAL_FOCUSABLE_SELECTOR)).filter(
      element => !element.hasAttribute('hidden')
    );
  }

  function resetFrameState() {
    const { frame, loading, status } = getElements();

    detachFrameListeners();

    if (frame) {
      frame.hidden = true;
      frame.src = 'about:blank';
      frame.setAttribute('aria-busy', 'true');
      frame.title = 'Source Assemblée';
    }

    if (loading) {
      loading.hidden = false;
      loading.textContent = DEFAULT_LOADING_TEXT;
    }

    if (status) {
      status.textContent = DEFAULT_STATUS_TEXT;
    }
  }

  function handleOverlayKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideVoteSourceModal();
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

  function handleOverlayClick(event) {
    const { overlay } = getElements();
    if (event.target === overlay) {
      hideVoteSourceModal();
    }
  }

  function showVoteSourceModal({ title = '', voteId = '', date = '', sourceUrl = '' } = {}) {
    const { overlay, title: titleEl, meta, frame, loading, status, link, dismissButton } = getElements();

    if (!overlay || !titleEl || !frame || !loading || !status || !link || !sourceUrl) {
      return false;
    }

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body?.style?.overflow || '';

    const titleText = stripLeadingFrenchArticle(title) || (voteId ? `Scrutin ${voteId}` : 'Source Assemblée');
    const metaText = [
      date ? `[${date}]` : '',
      voteId ? `scrutin ${voteId}` : ''
    ].filter(Boolean).join(' ');

    titleEl.textContent = titleText;

    if (meta) {
      meta.textContent = metaText;
      meta.hidden = !metaText;
    }

    link.href = sourceUrl;

    resetFrameState();
    frame.title = `Source Assemblée pour ${titleText}`;

    const handleLoad = () => {
      loading.hidden = true;
      frame.hidden = false;
      frame.removeAttribute('aria-busy');
      status.textContent = DEFAULT_STATUS_TEXT;
    };

    const handleError = () => {
      loading.hidden = false;
      loading.textContent = 'Impossible de charger la page intégrée.';
      frame.hidden = true;
      frame.removeAttribute('aria-busy');
      status.textContent = 'La page Assemblée n’a pas pu s’afficher correctement ici. Ouvrez la source dans un nouvel onglet.';
    };

    frame.addEventListener('load', handleLoad, { once: true });
    frame.addEventListener('error', handleError, { once: true });
    detachFrameListeners = () => {
      frame.removeEventListener('load', handleLoad);
      frame.removeEventListener('error', handleError);
      detachFrameListeners = () => {};
    };

    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.removeEventListener('keydown', handleOverlayKeydown);
    overlay.removeEventListener('click', handleOverlayClick);
    overlay.addEventListener('keydown', handleOverlayKeydown);
    overlay.addEventListener('click', handleOverlayClick);

    if (document.body) {
      document.body.style.overflow = 'hidden';
    }

    frame.src = sourceUrl;

    globalThis.requestAnimationFrame?.(() => {
      dismissButton?.focus();
    });

    return true;
  }

  function hideVoteSourceModal() {
    const { overlay } = getElements();
    if (!overlay) {
      return;
    }

    resetFrameState();
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeEventListener('keydown', handleOverlayKeydown);
    overlay.removeEventListener('click', handleOverlayClick);

    if (document.body) {
      document.body.style.overflow = previousBodyOverflow;
    }

    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    }

    lastFocusedElement = null;
    previousBodyOverflow = '';
  }

  const { dismissButton } = getElements();
  dismissButton?.addEventListener('click', hideVoteSourceModal);

  return {
    showVoteSourceModal,
    hideVoteSourceModal
  };
}
