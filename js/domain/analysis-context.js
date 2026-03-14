export async function computeAnalysisContextVotes(route, question, deputeVotes, options = {}) {
  const {
    resolveScopeVotes,
    applyScopeFilters,
    dedupeVotes,
    rankVotesForAnalysis,
    contextMinVotes,
    contextVoteLimit,
  } = options;

  if (
    typeof resolveScopeVotes !== 'function' ||
    typeof applyScopeFilters !== 'function' ||
    typeof dedupeVotes !== 'function' ||
    typeof rankVotesForAnalysis !== 'function'
  ) {
    throw new Error('computeAnalysisContextVotes requiert ses helpers de selection.');
  }

  const scopedVotes = resolveScopeVotes(route.scope, deputeVotes);
  const filteredVotes = applyScopeFilters(scopedVotes, route.scope, question);

  if (filteredVotes.length === 0) {
    return [];
  }

  const requestedLimit = Number.isFinite(route.scope?.filters?.limit)
    ? route.scope.filters.limit
    : null;
  const contextLimit = Math.max(
    contextMinVotes,
    Math.min(requestedLimit || contextVoteLimit, contextVoteLimit)
  );

  if (filteredVotes.length <= contextLimit) {
    return dedupeVotes(filteredVotes);
  }

  if (route.scope.source === 'last_result' || route.scope.isFollowUp) {
    return dedupeVotes(filteredVotes.slice(0, contextLimit));
  }

  const rankedVotes = await Promise.resolve(rankVotesForAnalysis(filteredVotes, question, route.scope));
  return dedupeVotes(rankedVotes.slice(0, contextLimit));
}
