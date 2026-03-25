export async function loadDeputeVotes(
  deputeId,
  {
    basePath = 'public/data/votes',
    fetchImpl = globalThis.fetch,
    logger = console
  } = {}
) {
  try {
    const response = await fetchImpl(`${basePath}/${deputeId}.json`);
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} sur le fichier de votes du depute ${deputeId}.`);
      error.status = response.status;
      throw error;
    }
    return { votes: await response.json(), error: null };
  } catch (error) {
    logger.error(`Votes: echec du chargement pour ${deputeId}.`, error);
    return { votes: [], error: error.message || 'Chargement des votes impossible.' };
  }
}
