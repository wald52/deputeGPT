import { getVoteId, normalizeQuestion } from './vote-normalizer.js';
import {
  TARGET_QUERY_DISTINCTIVE_STOPWORDS,
  TARGET_QUERY_STOPWORDS,
  THEME_CATEGORY_ALIASES,
  THEME_KEYWORDS,
} from './router-constants.js';

function buildThemeConfigForRouter(theme) {
  if (!theme) {
    return {
      theme: null,
      categories: [],
      keywords: []
    };
  }

  const normalizedTheme = normalizeQuestion(theme);
  const categories = (THEME_CATEGORY_ALIASES[normalizedTheme] || [normalizedTheme]).map(value => normalizeQuestion(value));
  const keywords = (THEME_KEYWORDS[normalizedTheme] || [normalizedTheme]).map(value => normalizeQuestion(value));

  return {
    theme: normalizedTheme,
    categories,
    keywords
  };
}

function getVoteThemeSearchTextForRouter(vote, lookupVoteSubject) {
  return normalizeQuestion([
    vote?.titre || '',
    lookupVoteSubject(vote) || ''
  ].join(' '));
}

function extractSearchTokensForRouter(value) {
  return new Set(
    normalizeQuestion(value)
      .split(/[^a-z0-9]+/g)
      .filter(token => token && token.length >= 4)
  );
}

function voteMatchesThemeForRouter(vote, themeConfig, options) {
  const { lookupVoteMetadata, lookupVoteSubject } = options;

  if (!vote || !themeConfig?.theme) {
    return false;
  }

  const normalizedCategory = normalizeQuestion(lookupVoteMetadata(vote)?.theme || lookupVoteMetadata(vote)?.category || '');
  if (themeConfig.categories.includes(normalizedCategory)) {
    return true;
  }

  const searchText = getVoteThemeSearchTextForRouter(vote, lookupVoteSubject);
  const searchTokens = extractSearchTokensForRouter(searchText);
  let matchedKeywordCount = 0;

  for (const keyword of themeConfig.keywords) {
    if (!keyword) {
      continue;
    }

    if (keyword.includes(' ')) {
      if (searchText.includes(keyword)) {
        return true;
      }
      continue;
    }

    if (searchTokens.has(keyword)) {
      matchedKeywordCount += 1;
      if (matchedKeywordCount >= 2) {
        return true;
      }
    }
  }

  return false;
}

export function resolveScopeVotes(scope, deputeVotes) {
  if (!Array.isArray(deputeVotes) || deputeVotes.length === 0) {
    return [];
  }

  if (scope.source !== 'last_result' || !Array.isArray(scope.voteIds)) {
    return [...deputeVotes];
  }

  const voteMap = new Map(deputeVotes.map(vote => [getVoteId(vote), vote]));
  return scope.voteIds
    .map(voteId => voteMap.get(String(voteId)))
    .filter(Boolean);
}

export function matchesDateRange(vote, filters) {
  const voteDate = String(vote?.date || '');
  if (!voteDate) {
    return true;
  }

  if (filters.dateFrom && voteDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && voteDate > filters.dateTo) {
    return false;
  }

  return true;
}

export function filterVotesByTheme(votes, theme, options = {}) {
  const { lookupVoteMetadata, lookupVoteSubject } = options;

  if (!theme || !Array.isArray(votes) || votes.length === 0) {
    return [...(votes || [])];
  }

  const themeConfig = buildThemeConfigForRouter(theme);
  const categoryMatches = votes.filter(vote => voteMatchesThemeForRouter(vote, themeConfig, {
    lookupVoteMetadata,
    lookupVoteSubject
  }));

  if (categoryMatches.length > 0) {
    return categoryMatches;
  }

  return votes.filter(vote => {
    const searchText = getVoteThemeSearchTextForRouter(vote, lookupVoteSubject);
    if (!searchText) {
      return false;
    }

    return themeConfig.keywords.some(keyword => keyword && keyword.includes(' ') && searchText.includes(keyword));
  });
}

export function extractTargetQueryTokens(queryText) {
  return normalizeQuestion(queryText)
    .split(/[^a-z0-9]+/g)
    .filter(token => token && (token.length >= 4 || /^\d+$/.test(token)) && !TARGET_QUERY_STOPWORDS.has(token));
}

export function matchesLeadingDocumentTypeQuery(normalizedQuery, title, subject) {
  if (normalizedQuery.startsWith('amendement')) {
    return /\bamendement\b/.test(title) || /\bamendement\b/.test(subject);
  }

  if (normalizedQuery.startsWith('article')) {
    return /^(?:l[' ]?)?article\b/.test(title) || /^(?:l[' ]?)?article\b/.test(subject);
  }

  if (normalizedQuery.startsWith('declaration')) {
    return /^(?:la\s+)?declaration\b/.test(title) || /^(?:la\s+)?declaration\b/.test(subject);
  }

  if (normalizedQuery.startsWith('motion')) {
    return /^(?:la\s+)?motion\b/.test(title) || /^(?:la\s+)?motion\b/.test(subject);
  }

  if (normalizedQuery.startsWith('resolution')) {
    return /^(?:la\s+)?(?:proposition de )?resolution\b/.test(title) || /^(?:la\s+)?(?:proposition de )?resolution\b/.test(subject);
  }

  if (normalizedQuery.startsWith('traite')) {
    return /\btraite\b/.test(title) || /\btraite\b/.test(subject);
  }

  return true;
}

export function filterVotesByQuery(votes, queryText, options = {}) {
  const {
    lookupVoteIndexText,
    lookupVoteSubject,
    extractQueryDisplayLabelFromVote,
  } = options;

  if (!queryText || !Array.isArray(votes) || votes.length === 0) {
    return [...(votes || [])];
  }

  const normalizedQuery = normalizeQuestion(queryText);
  const queryTokens = extractTargetQueryTokens(queryText);
  const distinctiveTokens = queryTokens.filter(token => !/^\d+$/.test(token) && !TARGET_QUERY_DISTINCTIVE_STOPWORDS.has(token));
  const requiredNumericTokens = queryTokens.filter(token => /^\d+$/.test(token));
  const minimumMatchedTokens = queryTokens.length <= 2
    ? queryTokens.length
    : Math.max(2, Math.ceil(queryTokens.length / 2));
  const minimumDistinctiveTokens = distinctiveTokens.length <= 1
    ? distinctiveTokens.length
    : Math.max(2, Math.ceil(distinctiveTokens.length / 2));

  return votes.filter(vote => {
    const haystack = lookupVoteIndexText(vote);
    const title = normalizeQuestion(vote?.titre || '');
    const subject = normalizeQuestion(lookupVoteSubject(vote));
    const exactLabel = normalizeQuestion(extractQueryDisplayLabelFromVote(vote, queryText));

    if (!haystack) {
      return false;
    }

    if (!matchesLeadingDocumentTypeQuery(normalizedQuery, title, subject)) {
      return false;
    }

    if (exactLabel === normalizedQuery || title === normalizedQuery || subject === normalizedQuery) {
      return true;
    }

    if (haystack.includes(normalizedQuery)) {
      return true;
    }

    if (requiredNumericTokens.length > 0 && !requiredNumericTokens.every(token => haystack.includes(token) || exactLabel.includes(token))) {
      return false;
    }

    let matchedTokenCount = 0;
    queryTokens.forEach(token => {
      if (title.includes(token) || subject.includes(token) || haystack.includes(token) || exactLabel.includes(token)) {
        matchedTokenCount += 1;
      }
    });

    if (matchedTokenCount < minimumMatchedTokens) {
      return false;
    }

    if (minimumDistinctiveTokens > 0) {
      let matchedDistinctiveTokenCount = 0;
      distinctiveTokens.forEach(token => {
        if (title.includes(token) || subject.includes(token) || haystack.includes(token) || exactLabel.includes(token)) {
          matchedDistinctiveTokenCount += 1;
        }
      });

      if (matchedDistinctiveTokenCount < minimumDistinctiveTokens) {
        return false;
      }
    }

    return true;
  });
}

export function findGlobalVotesByQuery(queryText, searchIndex, options = {}) {
  if (!queryText || !searchIndex?.votes) {
    return [];
  }

  const globalVotes = Object.entries(searchIndex.votes).map(([numero, data]) => ({
    numero,
    titre: data.titre || '',
    date: data.date || '',
    vote: ''
  }));

  return sortVotesByDate(filterVotesByQuery(globalVotes, queryText, options), 'date_desc');
}

export function sortVotesByDate(votes, sort = 'date_desc') {
  return [...votes].sort((left, right) => {
    const leftDate = String(left?.date || '');
    const rightDate = String(right?.date || '');
    return sort === 'date_asc'
      ? leftDate.localeCompare(rightDate)
      : rightDate.localeCompare(leftDate);
  });
}

export function applyScopeFilters(votes, scope, question, options = {}) {
  let filteredVotes = [...votes];

  if (scope.filters.dateFrom || scope.filters.dateTo) {
    filteredVotes = filteredVotes.filter(vote => matchesDateRange(vote, scope.filters));
  }

  if (scope.filters.vote) {
    filteredVotes = filteredVotes.filter(vote => vote.vote === scope.filters.vote);
  }

  if (scope.filters.queryText) {
    filteredVotes = filterVotesByQuery(filteredVotes, scope.filters.queryText, options);
  }

  if (scope.filters.theme) {
    filteredVotes = filterVotesByTheme(filteredVotes, scope.filters.theme, options);
  }

  return sortVotesByDate(filteredVotes, scope.filters.sort);
}

export function createScopedFiltersApplier(options = {}) {
  return function applyScopedFilters(votes, scope, question) {
    return applyScopeFilters(votes, scope, question, options);
  };
}

export function shouldClarifyLargeList(scope, intent, totalMatches, options = {}) {
  const { largeResultThreshold = 20 } = options;

  if (intent.kind !== 'list' && intent.kind !== 'subjects') {
    return false;
  }

  if (scope.source === 'last_result' || scope.isFollowUp) {
    return false;
  }

  if (scope.filters.limit) {
    return false;
  }

  const hasExplicitFilter = Boolean(
    scope.filters.theme ||
    scope.filters.vote ||
    scope.filters.queryText ||
    scope.filters.dateFrom ||
    scope.filters.dateTo
  );

  return totalMatches > largeResultThreshold && !hasExplicitFilter;
}
