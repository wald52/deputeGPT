export function createQueryDisplayHelpers({
  getVoteId,
  lookupVoteSubject,
  normalizeQuestion,
  extractTargetQueryTokens
}) {
  function getQueryDisplayLeadPattern(queryText) {
    const normalizedQuery = normalizeQuestion(queryText);

    if (normalizedQuery.startsWith('projet de loi')) {
      return /projet de loi/iu;
    }

    if (normalizedQuery.startsWith('proposition de loi')) {
      return /proposition de loi/iu;
    }

    if (normalizedQuery.startsWith('proposition de resolution europeenne')) {
      return /proposition de r[ée]solution europ[ée]enne/iu;
    }

    if (normalizedQuery.startsWith('proposition de resolution')) {
      return /proposition de r[ée]solution/iu;
    }

    if (normalizedQuery.startsWith('resolution europeenne')) {
      return /r[ée]solution europ[ée]enne/iu;
    }

    if (normalizedQuery.startsWith('resolution')) {
      return /r[ée]solution/iu;
    }

    if (normalizedQuery.startsWith('declaration du gouvernement')) {
      return /d[ée]claration du gouvernement/iu;
    }

    if (normalizedQuery.startsWith('declaration')) {
      return /d[ée]claration/iu;
    }

    if (normalizedQuery.startsWith('traite')) {
      return /trait[ée]/iu;
    }

    if (normalizedQuery.startsWith('motion')) {
      return /motion/iu;
    }

    if (normalizedQuery.startsWith('amendement')) {
      return /amendement/iu;
    }

    if (normalizedQuery.startsWith('article')) {
      return /article/iu;
    }

    if (normalizedQuery.startsWith('loi')) {
      return /loi/iu;
    }

    return null;
  }

  function extractQueryDisplayLabelFromVote(vote, queryText) {
    const rawTitle = String(vote?.titre || lookupVoteSubject(vote) || '').replace(/\s+/g, ' ').trim();
    if (!rawTitle) {
      return '';
    }

    const preferredPattern = getQueryDisplayLeadPattern(queryText);
    const preferredMatch = preferredPattern ? rawTitle.match(preferredPattern) : null;
    if (preferredMatch && Number.isInteger(preferredMatch.index)) {
      return rawTitle.slice(preferredMatch.index).replace(/[.]+$/g, '').trim();
    }

    const genericMatch = rawTitle.match(
      /(?:projet de loi|proposition de loi|proposition de r[ée]solution europ[ée]enne|proposition de r[ée]solution|r[ée]solution europ[ée]enne|r[ée]solution|d[ée]claration du gouvernement|d[ée]claration|motion|amendement|article|trait[ée]|loi)/iu
    );
    if (genericMatch && Number.isInteger(genericMatch.index)) {
      return rawTitle.slice(genericMatch.index).replace(/[.]+$/g, '').trim();
    }

    return rawTitle.replace(/[.]+$/g, '').trim();
  }

  function resolveQueryDisplayLabel(filters, context = {}) {
    const queryText = String(filters?.queryText || '').replace(/\s+/g, ' ').trim();
    if (!queryText) {
      return '';
    }

    const candidateVotes = [
      ...(context.filteredVotes || []),
      ...(context.displayedVotes || []),
      ...(context.deputeQueryMatches || []),
      ...(context.globalQueryMatches || [])
    ].filter(Boolean);
    const seenKeys = new Set();
    const uniqueVotes = candidateVotes.filter(vote => {
      const voteKey = getVoteId(vote);
      if (seenKeys.has(voteKey)) {
        return false;
      }
      seenKeys.add(voteKey);
      return true;
    });

    if (uniqueVotes.length === 0) {
      return queryText;
    }

    const normalizedQuery = normalizeQuestion(queryText);
    const queryTokens = extractTargetQueryTokens(queryText);
    const rankedVotes = uniqueVotes
      .map(vote => {
        const label = extractQueryDisplayLabelFromVote(vote, queryText);
        const normalizedLabel = normalizeQuestion(label);
        let score = 0;

        if (!label) {
          return null;
        }

        if (normalizedLabel === normalizedQuery) {
          score += 140;
        } else if (normalizedLabel.startsWith(normalizedQuery)) {
          score += 110;
        } else if (normalizedLabel.includes(normalizedQuery)) {
          score += 95;
        }

        queryTokens.forEach(token => {
          if (normalizedLabel.includes(token)) {
            score += 12;
          }
        });

        if (filters?.vote && vote?.vote === filters.vote) {
          score += 5;
        }

        score -= Math.min(30, label.length / 18);

        return {
          vote,
          label,
          score
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (left.label.length !== right.label.length) {
          return left.label.length - right.label.length;
        }

        return String(right.vote?.date || '').localeCompare(String(left.vote?.date || ''));
      });

    return rankedVotes[0]?.label || queryText;
  }

  function describeQueryFilter(filters, context = {}) {
    const queryLabel = resolveQueryDisplayLabel(filters, context);
    if (!queryLabel) {
      return '';
    }

    return `"${queryLabel}"`;
  }

  function describeQueryVotePhrase(filters, context = {}) {
    const queryText = resolveQueryDisplayLabel(filters, context);
    const queryDescription = describeQueryFilter(filters, context);
    if (!queryDescription) {
      return '';
    }

    const normalizedQuery = normalizeQuestion(queryText);
    const queryLabel = (
      normalizedQuery.startsWith('loi ') ||
      normalizedQuery.startsWith('proposition de loi') ||
      normalizedQuery.startsWith('motion') ||
      normalizedQuery.startsWith('resolution') ||
      normalizedQuery.startsWith('declaration') ||
      normalizedQuery.startsWith('proposition de resolution')
    )
      ? `la ${queryDescription}`
      : (
        normalizedQuery.startsWith('projet de loi') ||
        normalizedQuery.startsWith('traite') ||
        normalizedQuery.startsWith('texte') ||
        normalizedQuery.startsWith('amendement') ||
        normalizedQuery.startsWith('article')
      )
        ? `le ${queryDescription}`
        : queryDescription;

    if (filters?.vote === 'Pour') {
      return `pour ${queryLabel}`;
    }

    if (filters?.vote === 'Contre') {
      return `contre ${queryLabel}`;
    }

    if (filters?.vote === 'Abstention') {
      return `en abstention sur ${queryLabel}`;
    }

    return `sur ${queryLabel}`;
  }

  return {
    describeQueryFilter,
    describeQueryVotePhrase,
    extractQueryDisplayLabelFromVote,
    getQueryDisplayLeadPattern,
    resolveQueryDisplayLabel
  };
}
