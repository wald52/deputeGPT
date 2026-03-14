export function createThemeHelpers({
  normalizeQuestion,
  themeCategoryAliases,
  themeKeywords,
  lookupVoteMetadata,
  lookupVoteSubject
}) {
  function getThemeConfig(theme) {
    if (!theme) {
      return {
        theme: null,
        categories: [],
        keywords: []
      };
    }

    const normalizedTheme = normalizeQuestion(theme);
    const categories = (themeCategoryAliases[normalizedTheme] || [normalizedTheme]).map(value => normalizeQuestion(value));
    const keywords = (themeKeywords[normalizedTheme] || [normalizedTheme]).map(value => normalizeQuestion(value));

    return {
      theme: normalizedTheme,
      categories,
      keywords
    };
  }

  function getVoteThemeSearchText(vote) {
    return normalizeQuestion([
      vote?.titre || '',
      lookupVoteSubject(vote) || ''
    ].join(' '));
  }

  function extractSearchTokens(value) {
    return new Set(
      normalizeQuestion(value)
        .split(/[^a-z0-9]+/g)
        .filter(token => token && token.length >= 4)
    );
  }

  function voteMatchesTheme(vote, themeConfig) {
    if (!vote || !themeConfig?.theme) {
      return false;
    }

    const normalizedCategory = normalizeQuestion(lookupVoteMetadata(vote)?.theme || lookupVoteMetadata(vote)?.category || '');
    if (themeConfig.categories.includes(normalizedCategory)) {
      return true;
    }

    const searchText = getVoteThemeSearchText(vote);
    const searchTokens = extractSearchTokens(searchText);
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

  function inferVoteThemeLabel(vote) {
    const explicitThemeLabel = lookupVoteMetadata(vote)?.theme || lookupVoteMetadata(vote)?.category || '';
    if (explicitThemeLabel && explicitThemeLabel !== 'autre') {
      return explicitThemeLabel;
    }

    for (const theme of Object.keys(themeKeywords)) {
      if (voteMatchesTheme(vote, getThemeConfig(theme))) {
        return theme;
      }
    }

    return '';
  }

  return {
    extractSearchTokens,
    getThemeConfig,
    getVoteThemeSearchText,
    inferVoteThemeLabel,
    voteMatchesTheme
  };
}
