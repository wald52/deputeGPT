export function dedupeVotes(votes = []) {
  const seen = new Set();

  return votes.filter(vote => {
    const key = `${vote.numero || ''}|${vote.date || ''}|${vote.titre || ''}|${vote.vote || ''}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function createVoteHelpers({
  getCurrentVotes,
  getSearchIndexData,
  getVoteId,
  getVoteMetadata,
  getVoteIndexText,
  getVoteSubject,
  getVoteThemeLabel,
  getVoteSourceUrl,
  truncateAnalysisField
}) {
  function getVoteMap() {
    return new Map((getCurrentVotes?.() || []).map(vote => [getVoteId(vote), vote]));
  }

  function lookupVoteMetadata(vote) {
    return getVoteMetadata(vote, getSearchIndexData?.());
  }

  function lookupVoteSubject(vote) {
    return getVoteSubject(vote, getSearchIndexData?.());
  }

  function lookupVoteThemeLabel(vote) {
    return getVoteThemeLabel(vote, getSearchIndexData?.());
  }

  function lookupVoteIndexText(vote) {
    return getVoteIndexText(vote, getSearchIndexData?.());
  }

  function lookupVoteSourceUrl(vote) {
    return getVoteSourceUrl(vote, getSearchIndexData?.());
  }

  function resolveVotesByIds(voteIds = []) {
    const voteMap = getVoteMap();
    return voteIds
      .map(voteId => voteMap.get(String(voteId || '').trim()) || null)
      .filter(Boolean);
  }

  function buildMessageReferencesFromVoteIds(voteIds = [], options = {}) {
    const { maxItems = 6 } = options;
    if (!Array.isArray(voteIds) || voteIds.length === 0) {
      return [];
    }

    const voteMap = getVoteMap();
    const seen = new Set();
    const references = [];

    for (const rawVoteId of voteIds) {
      const voteId = String(rawVoteId || '').trim();
      if (!voteId || seen.has(voteId)) {
        continue;
      }
      seen.add(voteId);

      const vote = voteMap.get(voteId) || { numero: voteId };
      const metadata = lookupVoteMetadata(vote) || {};
      const title = lookupVoteSubject(vote) || metadata?.titre || `Scrutin ${voteId}`;
      const queryText = metadata?.titre || lookupVoteSubject(vote) || title;
      const date = vote?.date || metadata?.date || '';
      const theme = lookupVoteThemeLabel(vote) || metadata?.category || '';

      references.push({
        voteId,
        title: truncateAnalysisField(title, 140),
        queryText,
        date,
        theme: theme && theme !== 'autre' ? theme : '',
        sourceUrl: lookupVoteSourceUrl(vote)
      });

      if (references.length >= maxItems) {
        break;
      }
    }

    return references;
  }

  return {
    buildMessageReferencesFromVoteIds,
    lookupVoteIndexText,
    lookupVoteMetadata,
    lookupVoteSourceUrl,
    lookupVoteSubject,
    lookupVoteThemeLabel,
    resolveVotesByIds
  };
}
