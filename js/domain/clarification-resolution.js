import { DEFAULT_CHAT_LIST_LIMIT } from './router-constants.js';
import { createIntent, createScope } from './router-primitives.js';
import { normalizeQuestion } from './vote-normalizer.js';

function normalizeClarificationAnswerInternal(answer) {
  return normalizeQuestion(answer)
    .replace(/['’-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneScopeInternal(scope) {
  const clonedScope = createScope();
  if (!scope) {
    return clonedScope;
  }

  clonedScope.source = scope.source || clonedScope.source;
  clonedScope.voteIds = Array.isArray(scope.voteIds) ? [...scope.voteIds] : null;
  clonedScope.isFollowUp = Boolean(scope.isFollowUp);
  clonedScope.filters = {
    ...clonedScope.filters,
    ...(scope.filters || {})
  };
  clonedScope.needsClarification = Boolean(scope.needsClarification);
  clonedScope.clarification = scope.clarification || null;
  clonedScope.clarifyReason = scope.clarifyReason || null;

  return clonedScope;
}

function clearScopeClarificationInternal(scope) {
  scope.needsClarification = false;
  scope.clarification = null;
  scope.clarifyReason = null;
  return scope;
}

function hydrateLastResultScopeInternal(scope, session) {
  if (scope.source !== 'last_result') {
    return scope;
  }

  if (!Array.isArray(scope.voteIds) || scope.voteIds.length === 0) {
    scope.voteIds = Array.isArray(session?.lastResultVoteIds) ? [...session.lastResultVoteIds] : [];
  }

  return scope;
}

function createForcedIntentInternal(kind, signal) {
  const intent = createIntent();
  intent.kind = kind;
  intent.confidence = 1;
  intent.signals = signal ? [signal] : [];
  return intent;
}

function detectClarificationModeInternal(normalizedAnswer) {
  if (
    /\b(?:analyse|analyse thematique|synthese|synthese thematique|resume|resumer|interprete|interpretation)\b/u.test(normalizedAnswer)
  ) {
    return 'analysis';
  }

  if (/\b(?:sujets?|themes?\s+principaux|sur quoi|de quoi)\b/u.test(normalizedAnswer)) {
    return 'subjects';
  }

  if (/\b(?:compte|compter|compte les|compte le|comptage|nombre|combien)\b/u.test(normalizedAnswer)) {
    return 'count';
  }

  if (/\b(?:liste|lister|liste moi|affiche|montre)\b/u.test(normalizedAnswer)) {
    return 'list';
  }

  return null;
}

function detectClarificationScopeSourceInternal(normalizedAnswer) {
  if (
    /^(?:sur\s+)?(?:tout|tous|toute|toutes|tout l historique|tout l historique du depute|tous les votes|tous ses votes|l ensemble|ensemble|l ensemble des votes|ensemble des votes|l ensemble de ses votes|ensemble de ses votes)$/u.test(normalizedAnswer)
    || /\b(?:sur\s+)?(?:tout l historique|tous les votes|tout l ensemble|tout l historique du depute)\b/u.test(normalizedAnswer)
  ) {
    return 'depute_all';
  }

  if (
    /^(?:sur\s+)?(?:les derniers|les derniers votes|ceux affiches|ceux affiches a l ecran|ces votes|ceux ci|ceux la|dernier resultat)$/u.test(normalizedAnswer)
    || /\b(?:sur\s+)?(?:les derniers votes|ceux affiches|ces votes|ceux ci|dernier resultat)\b/u.test(normalizedAnswer)
  ) {
    return 'last_result';
  }

  return null;
}

function detectClarificationLimitInternal(normalizedAnswer) {
  let resolvedLimit = null;

  const explicitLimitMatch = normalizedAnswer.match(/^(\d{1,3})$/u);
  if (explicitLimitMatch) {
    resolvedLimit = Number(explicitLimitMatch[1]);
  }

  const trailingRecentLimitMatch = normalizedAnswer.match(/\b(\d{1,3})\s+derniers?(?:\s+votes?)?\b/u);
  if (trailingRecentLimitMatch) {
    resolvedLimit = Number(trailingRecentLimitMatch[1]);
  }

  const recentLimitMatch = normalizedAnswer.match(/\b(?:les\s+)?(\d{1,3})\s+plus\s+recents\b/u);
  if (recentLimitMatch) {
    resolvedLimit = Number(recentLimitMatch[1]);
  }

  if (/^(?:les derniers|les derniers votes)$/u.test(normalizedAnswer)) {
    resolvedLimit = DEFAULT_CHAT_LIST_LIMIT;
  }

  return Number.isFinite(resolvedLimit) && resolvedLimit > 0
    ? resolvedLimit
    : null;
}

function extractClarificationDecisionPartsInternal(normalizedAnswer) {
  return {
    modeKind: detectClarificationModeInternal(normalizedAnswer),
    scopeSource: detectClarificationScopeSourceInternal(normalizedAnswer),
    limit: detectClarificationLimitInternal(normalizedAnswer),
    assumptionText: null
  };
}

function normalizeStructuredModeInternal(mode) {
  const normalizedMode = normalizeClarificationAnswerInternal(mode);
  if (!normalizedMode) {
    return null;
  }

  if (normalizedMode === 'count') {
    return 'count';
  }

  if (normalizedMode === 'analysis') {
    return 'analysis';
  }

  if (normalizedMode === 'subjects' || normalizedMode === 'subjects mode') {
    return 'subjects';
  }

  if (normalizedMode === 'list') {
    return 'list';
  }

  return detectClarificationModeInternal(normalizedMode);
}

function normalizeStructuredScopeSourceInternal(scopeSource) {
  const normalizedScopeSource = normalizeClarificationAnswerInternal(scopeSource);
  if (!normalizedScopeSource) {
    return null;
  }

  if (['depute all', 'depute_all', 'all', 'all votes', 'history'].includes(normalizedScopeSource)) {
    return 'depute_all';
  }

  if (['last result', 'last_result', 'recent', 'displayed', 'displayed votes'].includes(normalizedScopeSource)) {
    return 'last_result';
  }

  return detectClarificationScopeSourceInternal(normalizedScopeSource);
}

function normalizeStructuredLimitInternal(limit) {
  const numericLimit = Number(limit);
  return Number.isFinite(numericLimit) && numericLimit > 0
    ? numericLimit
    : null;
}

function applyScopeSourceInternal(scope, scopeSource, session) {
  if (scopeSource === 'depute_all') {
    scope.source = 'depute_all';
    scope.voteIds = null;
    scope.isFollowUp = false;
    return true;
  }

  if (scopeSource === 'last_result') {
    if (!session?.lastResultVoteIds?.length) {
      return false;
    }

    scope.source = 'last_result';
    scope.voteIds = [...session.lastResultVoteIds];
    scope.isFollowUp = true;
    return true;
  }

  return true;
}

function applyLimitInternal(scope, limit) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return;
  }

  scope.filters.limit = limit;
  scope.filters.sort = scope.filters.sort || 'date_desc';
}

function buildResolutionFromPartsInternal(pendingClarification, session, parts, options = {}) {
  const {
    requireScope = false,
    requireMode = false,
    fallbackIntentKind = null
  } = options;

  const scope = hydrateLastResultScopeInternal(
    clearScopeClarificationInternal(cloneScopeInternal(pendingClarification.baseScope)),
    session
  );

  if (parts.scopeSource) {
    if (!applyScopeSourceInternal(scope, parts.scopeSource, session)) {
      return null;
    }
  } else if (requireScope) {
    return null;
  }

  if (scope.source === 'last_result' && (!scope.voteIds || scope.voteIds.length === 0)) {
    return null;
  }

  if (Number.isFinite(parts.limit) && parts.limit > 0) {
    applyLimitInternal(scope, parts.limit);
  }

  let intentOverride = null;

  if (parts.modeKind) {
    intentOverride = createForcedIntentInternal(parts.modeKind, `clarification_mode_${parts.modeKind}`);
  } else if (requireMode && !fallbackIntentKind) {
    return null;
  } else if (fallbackIntentKind && (Number.isFinite(parts.limit) || parts.scopeSource)) {
    intentOverride = createForcedIntentInternal(fallbackIntentKind, `clarification_large_list_${fallbackIntentKind}`);
  }

  return {
    question: pendingClarification.originalQuestion,
    scopeOverride: scope,
    intentOverride,
    assumptionText: parts.assumptionText || null
  };
}

function resolveScopeAnswerInternal(normalizedAnswer, pendingClarification, session) {
  const parts = extractClarificationDecisionPartsInternal(normalizedAnswer);
  return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
    requireScope: true
  });
}

function resolveModeAnswerInternal(normalizedAnswer, pendingClarification, session) {
  const parts = extractClarificationDecisionPartsInternal(normalizedAnswer);
  return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
    requireMode: true
  });
}

function resolveLargeListAnswerInternal(normalizedAnswer, pendingClarification, session) {
  const parts = extractClarificationDecisionPartsInternal(normalizedAnswer);
  const fallbackIntentKind = pendingClarification.basePlan?.questionType === 'subjects'
    ? 'subjects'
    : 'list';

  if (!parts.modeKind && !parts.scopeSource && !Number.isFinite(parts.limit)) {
    return null;
  }

  return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
    fallbackIntentKind
  });
}

export function resolvePendingClarification(question, session) {
  const pendingClarification = session?.pendingClarification;
  if (!pendingClarification?.kind || !pendingClarification?.originalQuestion) {
    return null;
  }

  const normalizedAnswer = normalizeClarificationAnswerInternal(question);
  if (!normalizedAnswer) {
    return null;
  }

  if (pendingClarification.kind === 'scope') {
    return resolveScopeAnswerInternal(normalizedAnswer, pendingClarification, session);
  }

  if (pendingClarification.kind === 'mode') {
    return resolveModeAnswerInternal(normalizedAnswer, pendingClarification, session);
  }

  if (pendingClarification.kind === 'large_list') {
    return resolveLargeListAnswerInternal(normalizedAnswer, pendingClarification, session);
  }

  return null;
}

export function resolveStructuredPendingClarification(decision, session) {
  const pendingClarification = session?.pendingClarification;
  if (!pendingClarification?.kind || !pendingClarification?.originalQuestion) {
    return null;
  }

  if (!decision || decision.resolved !== true) {
    return null;
  }

  const parts = {
    modeKind: normalizeStructuredModeInternal(decision.mode),
    scopeSource: normalizeStructuredScopeSourceInternal(decision.scopeSource),
    limit: normalizeStructuredLimitInternal(decision.limit),
    assumptionText: String(decision.assumptionText || '').trim() || null
  };

  if (pendingClarification.kind === 'scope') {
    return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
      requireScope: true
    });
  }

  if (pendingClarification.kind === 'mode') {
    return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
      requireMode: true
    });
  }

  if (pendingClarification.kind === 'large_list') {
    return buildResolutionFromPartsInternal(pendingClarification, session, parts, {
      fallbackIntentKind: pendingClarification.basePlan?.questionType === 'subjects'
        ? 'subjects'
        : 'list'
    });
  }

  return null;
}
