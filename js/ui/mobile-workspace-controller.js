export function createMobileWorkspaceController({
  appState,
  mobileMedia = '(max-width: 920px)'
}) {
  const mediaQuery = window.matchMedia(mobileMedia);
  let activeView = 'explore';

  function getElements() {
    return {
      switcher: document.querySelector('.mobile-workspace-switcher'),
      exploreBtn: document.getElementById('workspace-switch-explore'),
      chatBtn: document.getElementById('workspace-switch-chat'),
      explorePanel: document.getElementById('explorer-panel'),
      chatPanel: document.getElementById('chat-panel')
    };
  }

  function syncButtons({ exploreBtn, chatBtn }, hasSelectedDepute) {
    const isExploreView = activeView === 'explore';
    const isChatView = activeView === 'chat';

    exploreBtn?.classList.toggle('is-active', isExploreView);
    chatBtn?.classList.toggle('is-active', isChatView);

    if (exploreBtn) {
      exploreBtn.setAttribute('aria-pressed', String(isExploreView));
    }

    if (chatBtn) {
      chatBtn.setAttribute('aria-pressed', String(isChatView));
      chatBtn.disabled = !hasSelectedDepute;
    }
  }

  function applyLayout() {
    const {
      switcher,
      exploreBtn,
      chatBtn,
      explorePanel,
      chatPanel
    } = getElements();

    if (!switcher || !explorePanel || !chatPanel) {
      return;
    }

    const hasSelectedDepute = Boolean(appState.currentDepute);

    if (!hasSelectedDepute && activeView === 'chat') {
      activeView = 'explore';
    }

    syncButtons({ exploreBtn, chatBtn }, hasSelectedDepute);

    if (!mediaQuery.matches) {
      switcher.hidden = true;
      explorePanel.hidden = false;
      chatPanel.hidden = false;
      document.body.removeAttribute('data-mobile-view');
      return;
    }

    switcher.hidden = false;
    document.body.dataset.mobileView = activeView;
    explorePanel.hidden = activeView !== 'explore';
    chatPanel.hidden = activeView !== 'chat';
  }

  function setActiveView(view, { scrollIntoView = false } = {}) {
    if (view !== 'explore' && view !== 'chat') {
      return;
    }

    if (view === 'chat' && !appState.currentDepute) {
      return;
    }

    activeView = view;
    applyLayout();

    if (!scrollIntoView || !mediaQuery.matches) {
      return;
    }

    const scrollTarget = document.querySelector('.mobile-workspace-switcher')
      || document.getElementById(view === 'chat' ? 'chat-panel' : 'explorer-panel');

    if (scrollTarget) {
      scrollTarget.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function handleDeputeSelected() {
    if (!mediaQuery.matches) {
      applyLayout();
      return;
    }

    setActiveView('chat', { scrollIntoView: true });
  }

  function setupMobileWorkspace() {
    const { exploreBtn, chatBtn } = getElements();

    exploreBtn?.addEventListener('click', () => {
      setActiveView('explore', { scrollIntoView: true });
    });

    chatBtn?.addEventListener('click', () => {
      setActiveView('chat', { scrollIntoView: true });
    });

    mediaQuery.addEventListener('change', () => {
      applyLayout();
    });

    document.addEventListener('depute:selected', handleDeputeSelected);
    applyLayout();
  }

  return {
    setupMobileWorkspace,
    setActiveView
  };
}
