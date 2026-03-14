export async function loadGroupesData({
  path = 'public/data/deputes_actifs/groupes.json',
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  try {
    const response = await fetchImpl(path, { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch (error) {
    logger.error('Erreur chargement groupes:', error);
    return [];
  }
}
