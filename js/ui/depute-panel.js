function buildDeputePanelDetailsInternal(depute, placesMapping) {
  let details = depute.groupe || depute.groupeNom || '';
  const seatNumber = placesMapping?.[depute.id];

  if (seatNumber) {
    details += ` | Siege ${seatNumber}`;
  }

  if (depute.departementNom && depute.circo) {
    const circoNum = parseInt(depute.circo, 10);
    const circoFormatted = circoNum === 1 ? '1re' : `${circoNum}e`;
    details += ` | ${depute.departementNom} (${circoFormatted} circonscription)`;
  }

  return details;
}

export function createDeputePanelController({
  appState,
  getPlacesMapping,
  resetChatSession,
  setActiveSeatByDepute,
  updateChatScopeSummary,
  getChatHistory,
  getActiveModelConfig,
  clearRenderedMessages,
  updateChatEmptyState,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl,
  syncChatAvailability,
  loadDeputeVotes,
  addMessage
}) {
  async function selectDepute(depute) {
    appState.currentDepute = depute;
    resetChatSession(depute.id);
    setActiveSeatByDepute(depute);
    updateChatScopeSummary();

    const chatHistory = getChatHistory();
    if (chatHistory) {
      try {
        await chatHistory.getOrCreateActiveSession(depute, getActiveModelConfig());
      } catch (error) {
        console.warn('⚠️ Erreur création session historique:', error);
      }
    }

    clearRenderedMessages();
    updateChatEmptyState();

    document.getElementById('depute-placeholder').hidden = true;
    document.getElementById('depute-content').hidden = false;
    document.getElementById('selected-depute').classList.add('active');
    document.getElementById('depute-name').textContent = `${depute.prenom} ${depute.nom}`;
    document.getElementById('depute-details').textContent = buildDeputePanelDetailsInternal(depute, getPlacesMapping());

    const imgEl = document.getElementById('depute-img');
    imgEl.src = getDeputePhotoUrl(depute);
    imgEl.alt = `Portrait de ${depute.prenom} ${depute.nom}`;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = deputePhotoPlaceholderUrl;
    };

    const statsContainer = document.getElementById('stats-container');
    statsContainer.hidden = true;
    statsContainer.style.opacity = '0.5';
    document.getElementById('stat-votes').textContent = '0';
    syncChatAvailability();
    document.getElementById('user-input').placeholder = 'Chargement des votes en cours...';

    appState.currentDepute.votes = await loadDeputeVotes(depute.id);

    statsContainer.style.opacity = '1';
    document.getElementById('stat-votes').textContent = appState.currentDepute.votes.length;
    document.getElementById('stat-pour').textContent = appState.currentDepute.votes.filter(vote => vote.vote === 'Pour').length;
    document.getElementById('stat-contre').textContent = appState.currentDepute.votes.filter(vote => vote.vote === 'Contre').length;

    await addMessage('system', `Donnees chargees pour ${depute.prenom} ${depute.nom}. (${appState.currentDepute.votes.length} votes)`, { method: 'system' });
    syncChatAvailability();
    updateChatScopeSummary();
  }

  return {
    selectDepute
  };
}
