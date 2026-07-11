/**
 * Encodeur de requete distant, signature-compatible avec le pipeline
 * transformers.js utilise par le RAG semantique local : async (texte) => vecteur.
 *
 * La troncature Matryoshka + re-normalisation L2 a la dimension de l'index est
 * OBLIGATOIRE ici : le scoring int8 fait un produit scalaire sur le min des
 * longueurs, donc une requete 2048 contre des documents 512 donnerait un score
 * faux mais plausible.
 *
 * Contrat : ne jette jamais — tout echec retourne [] et le classement retombe
 * sur les circuits lexical/local existants.
 */
export function createRemoteQueryEncoder({ workerRagClient, model } = {}) {
  const dimension = Number(model?.dimension) || 0;
  if (!workerRagClient || typeof workerRagClient.embedQuery !== 'function' || dimension <= 0) {
    return null;
  }

  return async function encodeRemoteQuery(text) {
    try {
      const rawEmbedding = await workerRagClient.embedQuery(String(text || ''));
      if (!Array.isArray(rawEmbedding) || rawEmbedding.length < dimension) {
        return [];
      }

      const truncated = rawEmbedding.slice(0, dimension);
      let squaredNorm = 0;
      for (let index = 0; index < truncated.length; index += 1) {
        squaredNorm += truncated[index] * truncated[index];
      }

      const norm = Math.sqrt(squaredNorm);
      if (!Number.isFinite(norm) || norm === 0) {
        return [];
      }

      return truncated.map(value => value / norm);
    } catch (error) {
      return [];
    }
  };
}
