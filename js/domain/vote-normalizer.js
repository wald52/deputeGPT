export function normalizeQuestion(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’]/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripExtractedQueryFromQuestion(question, queryText) {
  const rawQuestion = String(question || '');
  const rawQueryText = String(queryText || '').replace(/\s+/g, ' ').trim();
  if (!rawQueryText) {
    return rawQuestion;
  }

  return rawQuestion
    .replace(new RegExp(escapeRegExp(rawQueryText), 'iu'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getVoteId(vote) {
  if (!vote) {
    return '';
  }

  if (vote.numero !== undefined && vote.numero !== null && String(vote.numero).trim()) {
    return String(vote.numero).trim();
  }

  return `${vote.date || ''}|${vote.titre || ''}|${vote.vote || ''}`;
}
