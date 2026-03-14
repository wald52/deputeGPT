import { normalizeQuestion } from './vote-normalizer.js';
import { DEFAULT_CHAT_LIST_LIMIT, FOLLOW_UP_MARKERS } from './router-constants.js';
import { createScope } from './router-primitives.js';
import {
  detectLimit,
  detectSort,
  detectTheme,
  detectVoteFilter,
  extractDateRange,
  extractSpecificVoteQuery,
  stripQueryForDateParsing,
} from './intent-detectors.js';

export function resolveScope(question, session) {
  const normalizedQuestion = normalizeQuestion(question);
  const scope = createScope();
  const monthMap = {
    janvier: '01',
    fevrier: '02',
    mars: '03',
    avril: '04',
    mai: '05',
    juin: '06',
    juillet: '07',
    aout: '08',
    septembre: '09',
    octobre: '10',
    novembre: '11',
    decembre: '12'
  };
  const hasRecentListRequest = /\bplus\s+recents\b/.test(normalizedQuestion) || /\bderniers?\s+votes?\b/.test(normalizedQuestion) || /\bles\s+derniers\s*\??$/.test(normalizedQuestion);
  const hasExplicitDeputyReference = /\b(?:ce|cet|cette)\s+depute\b/.test(normalizedQuestion);
  const implicitFollowUpMarkers = new Set(['et', 'aussi', 'par contre', 'a l\'inverse']);
  const hasExplicitFollowUp = FOLLOW_UP_MARKERS
    .map(marker => normalizeQuestion(marker))
    .filter(marker => !implicitFollowUpMarkers.has(marker))
    .some(marker => normalizedQuestion.includes(marker));
  const hasImplicitFollowUpMarker = FOLLOW_UP_MARKERS
    .map(marker => normalizeQuestion(marker))
    .filter(marker => implicitFollowUpMarkers.has(marker))
    .some(marker => {
      if (marker === 'et') {
        return /^et\b/.test(normalizedQuestion);
      }
      if (marker === 'aussi') {
        return /^(?:et\s+)?aussi\b/.test(normalizedQuestion);
      }
      if (marker === 'par contre') {
        return /\bpar contre\b/.test(normalizedQuestion);
      }
      if (marker === 'a l\'inverse') {
        return /\ba l[' ]inverse\b/.test(normalizedQuestion);
      }
      return false;
    });
  const hasImplicitPronounFollowUp = /^(?:et\s+)?(?:il|elle)\b/.test(normalizedQuestion);
  const hasShortVoteFollowUp = /^(?:et\s+)?(?:pour|contre)\b/.test(normalizedQuestion);
  const hasImplicitFollowUp = hasImplicitFollowUpMarker || hasImplicitPronounFollowUp || hasShortVoteFollowUp;

  scope.filters.theme = detectTheme(normalizedQuestion);
  scope.filters.vote = detectVoteFilter(normalizedQuestion);
  scope.filters.queryText = extractSpecificVoteQuery(question);
  scope.filters.limit = detectLimit(normalizedQuestion);
  scope.filters.sort = detectSort(normalizedQuestion);

  const normalizedQuestionWithoutQueryText = stripQueryForDateParsing(question, scope.filters.queryText);
  const dateRange = extractDateRange(normalizedQuestionWithoutQueryText);
  const exactFrenchDateWithoutYearMatch = normalizedQuestionWithoutQueryText.match(/\b(1er|[12]?\d|3[01])\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
  const monthOnlyMatch = normalizedQuestionWithoutQueryText.match(/\b(?:au\s+mois\s+de\s+|en\s+)?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
  scope.filters.dateFrom = dateRange.dateFrom;
  scope.filters.dateTo = dateRange.dateTo;

  if (scope.filters.queryText) {
    scope.filters.theme = null;
  }

  if (/\b(?:les?|ces?)\s+\d+\s+derniers?\s+mois\b/.test(normalizedQuestion)) {
    scope.filters.limit = null;
  }

  if (!scope.filters.limit && hasRecentListRequest) {
    scope.filters.limit = DEFAULT_CHAT_LIST_LIMIT;
  }

  if (!scope.filters.vote) {
    if (/^(?:et\s+)?contre\b/.test(normalizedQuestion)) {
      scope.filters.vote = 'Contre';
    } else if (/^(?:et\s+)?pour\b/.test(normalizedQuestion)) {
      scope.filters.vote = 'Pour';
    }
  }

  const hasContextualRecentReference = hasRecentListRequest
    && Boolean(session?.lastResultVoteIds?.length)
    && !hasExplicitDeputyReference
    && !scope.filters.queryText
    && !scope.filters.theme
    && !scope.filters.dateFrom
    && !scope.filters.dateTo;

  if (hasExplicitFollowUp) {
    scope.isFollowUp = true;

    if (!session.lastResultVoteIds?.length) {
      scope.needsClarification = true;
      scope.clarification = 'Vous parlez de quels votes ?';
      scope.clarifyReason = 'needs_context';
      return scope;
    }

    scope.source = 'last_result';
    scope.voteIds = [...session.lastResultVoteIds];

    if (!scope.filters.theme && session?.lastTheme) {
      scope.filters.theme = session.lastTheme;
    }

    return scope;
  }

  if (hasImplicitFollowUp || hasContextualRecentReference) {
    scope.isFollowUp = true;

    if (!session?.lastResultVoteIds?.length) {
      scope.needsClarification = true;
      scope.clarification = 'Vous parlez de quels votes ?';
      scope.clarifyReason = 'needs_context';
      return scope;
    }

    scope.source = 'last_result';
    scope.voteIds = [...session.lastResultVoteIds];

    if (!scope.filters.theme && session?.lastTheme) {
      scope.filters.theme = session.lastTheme;
    }

    if (!scope.filters.dateFrom && !scope.filters.dateTo && exactFrenchDateWithoutYearMatch && session?.lastDateRange) {
      const inheritedDate = String(session.lastDateRange.dateFrom || session.lastDateRange.dateTo || '');
      const inheritedYearMatch = inheritedDate.match(/^(\d{4})-/);
      if (inheritedYearMatch) {
        const inheritedYear = inheritedYearMatch[1];
        const rawDay = exactFrenchDateWithoutYearMatch[1];
        const month = monthMap[exactFrenchDateWithoutYearMatch[2]];
        const day = String(rawDay === '1er' ? 1 : Number(rawDay)).padStart(2, '0');
        const exactDate = `${inheritedYear}-${month}-${day}`;
        scope.filters.dateFrom = exactDate;
        scope.filters.dateTo = exactDate;
      }
    }

    if (!scope.filters.dateFrom && !scope.filters.dateTo && monthOnlyMatch && session?.lastDateRange) {
      const inheritedDate = String(session.lastDateRange.dateFrom || session.lastDateRange.dateTo || '');
      const inheritedYearMatch = inheritedDate.match(/^(\d{4})-/);
      if (inheritedYearMatch) {
        const inheritedYear = inheritedYearMatch[1];
        const month = monthMap[monthOnlyMatch[1]];
        const lastDayOfMonth = new Date(Date.UTC(Number(inheritedYear), Number(month), 0)).getUTCDate();
        scope.filters.dateFrom = `${inheritedYear}-${month}-01`;
        scope.filters.dateTo = `${inheritedYear}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;
      }
    }
  }

  if (
    scope.source !== 'last_result' &&
    (scope.filters.theme || scope.filters.vote || scope.filters.queryText || scope.filters.limit || scope.filters.dateFrom || scope.filters.dateTo)
  ) {
    scope.source = 'explicit_filter';
  }

  return scope;
}
