export function createAnalysisRankingHelpers({
  normalizeQuestion,
  analysisStopwords,
  themeKeywords,
  hasLexicalSearchReady,
  searchVotesInIndex,
  analysisSearchResultLimit,
  isSemanticRagEnabled,
  isSemanticRagReady,
  buildSemanticScores,
  semanticCandidateLimit = 40,
  semanticScoreWeight = 18,
  getVoteId,
  lookupVoteIndexText,
  lookupVoteSubject,
  lookupVoteThemeLabel
}) {
  function extractAnalysisKeywords(question, scope) {
    const keywords = normalizeQuestion(question)
      .split(/[^a-z0-9]+/g)
      .filter(token => token && token.length >= 4 && !analysisStopwords.has(token));

    if (scope?.filters?.theme && themeKeywords[scope.filters.theme]) {
      themeKeywords[scope.filters.theme]
        .map(keyword => normalizeQuestion(keyword))
        .flatMap(keyword => keyword.split(/[^a-z0-9]+/g))
        .filter(token => token && token.length >= 4 && !analysisStopwords.has(token))
        .forEach(token => keywords.push(token));
    }

    return [...new Set(keywords)];
  }

  function buildAnalysisLexicalScores(filteredVotes, question, scope) {
    const lexicalScores = new Map();

    if (!hasLexicalSearchReady() || !Array.isArray(filteredVotes) || filteredVotes.length === 0) {
      return lexicalScores;
    }

    const allowedVoteIds = new Set(filteredVotes.map(getVoteId));
    const searchQueries = [question];

    if (scope?.filters?.theme && themeKeywords[scope.filters.theme]) {
      searchQueries.push(themeKeywords[scope.filters.theme].join(' '));
    }

    searchQueries
      .filter(query => typeof query === 'string' && query.trim())
      .forEach(query => {
        searchVotesInIndex(query, analysisSearchResultLimit).forEach(result => {
          const voteId = String(result.numero || result.id || '');
          if (!allowedVoteIds.has(voteId)) {
            return;
          }

          const currentScore = lexicalScores.get(voteId) || 0;
          lexicalScores.set(voteId, Math.max(currentScore, Number(result.score) || 0));
        });
      });

    return lexicalScores;
  }

  async function rankVotesForAnalysis(filteredVotes, question, scope) {
    const keywords = extractAnalysisKeywords(question, scope);
    const lexicalScores = buildAnalysisLexicalScores(filteredVotes, question, scope);

    const scoredVotes = filteredVotes.map(vote => {
      const voteId = getVoteId(vote);
      const haystack = lookupVoteIndexText(vote);
      const title = normalizeQuestion(vote?.titre || '');
      const subject = normalizeQuestion(lookupVoteSubject(vote));
      let score = lexicalScores.get(voteId) || 0;

      keywords.forEach(keyword => {
        if (title.includes(keyword)) {
          score += 7;
        } else if (subject.includes(keyword)) {
          score += 5;
        } else if (haystack.includes(keyword)) {
          score += 3;
        }
      });

      if (scope?.filters?.theme && normalizeQuestion(lookupVoteThemeLabel(vote)) === normalizeQuestion(scope.filters.theme)) {
        score += 10;
      }

      return { vote, score };
    });

    const rankedCandidates = [...scoredVotes].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(right.vote?.date || '').localeCompare(String(left.vote?.date || ''));
    });

    if (
      isSemanticRagEnabled?.() &&
      isSemanticRagReady?.() &&
      typeof buildSemanticScores === 'function' &&
      rankedCandidates.length > 0
    ) {
      const semanticCandidates = rankedCandidates
        .slice(0, semanticCandidateLimit)
        .map(entry => entry.vote);
      const semanticScores = await Promise.resolve(buildSemanticScores(question, semanticCandidates));

      if (semanticScores instanceof Map && semanticScores.size > 0) {
        scoredVotes.forEach(entry => {
          const semanticScore = semanticScores.get(getVoteId(entry.vote));
          if (Number.isFinite(semanticScore)) {
            entry.score += semanticScore * semanticScoreWeight;
          }
        });
      }
    }

    scoredVotes.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(right.vote?.date || '').localeCompare(String(left.vote?.date || ''));
    });

    return scoredVotes.map(entry => entry.vote);
  }

  return {
    buildAnalysisLexicalScores,
    extractAnalysisKeywords,
    rankVotesForAnalysis
  };
}
