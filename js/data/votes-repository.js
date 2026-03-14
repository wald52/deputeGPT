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
      return [];
    }
    return await response.json();
  } catch (error) {
    logger.error('ERREUR TECHNIQUE (Fetch) :', error);
    return [];
  }
}
