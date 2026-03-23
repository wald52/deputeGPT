import { resolvePendingClarification } from './clarification-resolution.js';
import { classifyIntent } from './intent-classifier.js';
import { detectClarifyOnlyQuestion, detectUnsupportedQuestion } from './intent-detectors.js';
import { createIntent, createRoutePlan, createScope } from './router-primitives.js';
import { resolveScope } from './scope-resolver.js';
import { normalizeQuestion } from './vote-normalizer.js';

const MODE_CLARIFICATION_MESSAGE = 'Voulez-vous une liste de votes, un comptage ou une analyse thematique ?';

function createForcedIntentInternal(kind, signal = 'response_first_default') {
  const intent = createIntent();
  intent.kind = kind;
  intent.confidence = 0.6;
  intent.reason = 'response_first_default';
  intent.signals = [signal];
  return intent;
}

function cloneScopeForResponseFirstInternal(scope) {
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
  clonedScope.needsClarification = false;
  clonedScope.clarification = null;
  clonedScope.clarifyReason = null;
  return clonedScope;
}

function buildClarificationChoicesInternal(kind, session) {
  if (kind === 'mode') {
    return [
      { label: 'Liste', question: 'liste' },
      { label: 'Nombre', question: 'nombre' },
      { label: 'Analyse', question: 'analyse' }
    ];
  }

  if (kind === 'scope') {
    const choices = [];
    if (Array.isArray(session?.lastResultVoteIds) && session.lastResultVoteIds.length > 0) {
      choices.push({ label: 'Derniers votes', question: 'sur les derniers votes' });
    }
    choices.push({ label: 'Tout l historique', question: 'sur tout l historique' });
    return choices;
  }

  if (kind === 'large_list') {
    return [
      { label: '12', question: '12' },
      { label: '20', question: '20 derniers' },
      { label: '50', question: '50 derniers' }
    ];
  }

  return [];
}

function resolveResponseFirstScopeInternal(scope, session, options = {}) {
  if (!options.preferResponseFirst || !scope?.needsClarification) {
    return {
      scope,
      scopeWasDefaulted: false
    };
  }

  const defaultScope = cloneScopeForResponseFirstInternal(scope);

  if (Array.isArray(session?.lastResultVoteIds) && session.lastResultVoteIds.length > 0) {
    defaultScope.source = 'last_result';
    defaultScope.voteIds = [...session.lastResultVoteIds];
    defaultScope.isFollowUp = true;
  } else {
    defaultScope.source = 'depute_all';
    defaultScope.voteIds = null;
    defaultScope.isFollowUp = false;
  }

  return {
    scope: defaultScope,
    scopeWasDefaulted: true
  };
}

function chooseResponseFirstIntentKindInternal(question, scope, reason, options = {}) {
  const normalizedQuestion = normalizeQuestion(question).replace(/['’-]/gu, ' ').replace(/-/g, ' ');
  const canUseAnalysis = Boolean(options.hasActiveClarificationProvider);
  const hasSubjectCue = /\b(?:sujets?|themes?|themes? principaux|portent|concernent|de quoi parlent)\b/u.test(normalizedQuestion);
  const hasAnalysisCue = /\b(?:analyse|synthese|resume|resumer|position|coherence|coherent|tendance|ligne|impact|revelent|revele)\b/u.test(normalizedQuestion);

  if (canUseAnalysis && (reason === 'needs_mode' || hasAnalysisCue)) {
    return 'analysis';
  }

  if (hasSubjectCue || (reason === 'needs_mode' && (scope?.filters?.theme || scope?.filters?.queryText))) {
    return 'subjects';
  }

  return 'list';
}

function buildResponseFirstAssumptionInternal(scope, intentKind, state = {}) {
  const { scopeWasDefaulted = false, modeWasDefaulted = false } = state;
  const modeLabel = intentKind === 'analysis'
    ? 'une analyse'
    : intentKind === 'count'
      ? 'un comptage'
      : intentKind === 'subjects'
        ? 'les sujets principaux'
        : 'une liste';
  const scopeLabel = scope?.source === 'last_result'
    ? 'le dernier resultat affiche'
    : scope?.source === 'explicit_filter'
      ? 'le sous-ensemble en cours'
      : 'tout l historique du depute';

  const correctionHints = [];
  if (scopeWasDefaulted) {
    correctionHints.push(scope?.source === 'last_result' ? 'Dites "tout l historique" si vous vouliez elargir.' : 'Dites "les derniers votes" si vous vouliez seulement le dernier resultat.');
  }
  if (modeWasDefaulted) {
    correctionHints.push('Dites "liste", "nombre" ou "analyse" pour changer de format.');
  }

  return [`Hypothese retenue : je pars sur ${modeLabel} pour ${scopeLabel}.`, ...correctionHints]
    .filter(Boolean)
    .join(' ');
}

function buildResponseFirstRouteInternal(question, scope, session, reason, options = {}, defaults = {}) {
  if (!options.preferResponseFirst) {
    return null;
  }

  const hasScopedContext = defaults.scopeWasDefaulted
    || scope?.isFollowUp
    || scope?.source === 'last_result'
    || Boolean(scope?.filters?.theme || scope?.filters?.vote || scope?.filters?.queryText || scope?.filters?.dateFrom || scope?.filters?.dateTo || scope?.filters?.limit);

  if (!hasScopedContext && reason !== 'needs_mode') {
    return null;
  }

  const forcedIntentKind = chooseResponseFirstIntentKindInternal(question, scope, reason, options);
  if (!forcedIntentKind) {
    return null;
  }

  const intent = createForcedIntentInternal(forcedIntentKind);
  const plan = buildRoutePlan(scope, intent);
  const assumptionText = buildResponseFirstAssumptionInternal(scope, forcedIntentKind, {
    scopeWasDefaulted: Boolean(defaults.scopeWasDefaulted),
    modeWasDefaulted: true
  });

  return {
    action: forcedIntentKind === 'analysis' ? 'analysis_rag' : 'deterministic',
    scope,
    intent,
    plan,
    resolvedQuestion: question,
    assumptionText
  };
}

function buildRoutePlan(scope, intent) {
  const plan = createRoutePlan();
  plan.questionType = intent.kind || 'clarify';
  plan.requiresLlm = intent.kind === 'analysis';
  plan.responseMode = intent.kind === 'clarify'
    ? 'clarify'
    : intent.kind === 'analysis'
      ? 'analysis_rag'
      : 'deterministic';
  plan.unsupportedReason = intent.kind === 'clarify' ? intent.reason || null : null;

  if (intent.kind === 'clarify') {
    plan.candidateStrategy = 'none';
    return plan;
  }

  if (scope?.source === 'last_result' || scope?.isFollowUp) {
    plan.candidateStrategy = 'last_result_subset';
    return plan;
  }

  if (scope?.filters?.queryText) {
    plan.candidateStrategy = plan.requiresLlm ? 'lexical_candidates' : 'lexical_lookup';
    return plan;
  }

  if (scope?.filters?.theme || scope?.filters?.vote || scope?.filters?.dateFrom || scope?.filters?.dateTo) {
    plan.candidateStrategy = 'structured_filters';
    return plan;
  }

  if (scope?.filters?.limit) {
    plan.candidateStrategy = 'recent_votes';
    return plan;
  }

  plan.candidateStrategy = plan.requiresLlm ? 'scoped_history' : 'recent_votes';
  return plan;
}

function routeQuestionInternal(question, session, options = {}) {
  const effectiveQuestion = options.questionOverride || question;
  const shouldBypassPreclassification = Boolean(options.intentOverride);
  let assumptionText = String(options.assumptionText || '').trim() || null;

  if (!session.activeDeputeId) {
    const intent = createIntent();
    intent.kind = 'clarify';
    intent.confidence = 1;
    intent.reason = 'needs_context';
    return {
      action: 'clarify',
      message: 'Choisissez d\'abord un depute.',
      intent,
      plan: buildRoutePlan(null, intent),
      resolvedQuestion: effectiveQuestion
    };
  }

  const initialScope = options.scopeOverride || resolveScope(effectiveQuestion, session);
  const scopeDefaults = resolveResponseFirstScopeInternal(initialScope, session, options);
  const scope = scopeDefaults.scope;

  if (!shouldBypassPreclassification) {
    const unsupportedDecision = detectUnsupportedQuestion(effectiveQuestion);
    if (unsupportedDecision) {
      const intent = createIntent();
      intent.kind = 'clarify';
      intent.confidence = 1;
      intent.reason = unsupportedDecision.reason;
      intent.signals = [unsupportedDecision.signal];
      return {
        action: 'clarify',
        reason: unsupportedDecision.reason,
        message: unsupportedDecision.message,
        scope: null,
        intent,
        plan: buildRoutePlan(null, intent),
        resolvedQuestion: effectiveQuestion
      };
    }

    const clarifyOnlyDecision = detectClarifyOnlyQuestion(effectiveQuestion, scope);

    if (clarifyOnlyDecision) {
      const responseFirstRoute = buildResponseFirstRouteInternal(
        effectiveQuestion,
        scope,
        session,
        clarifyOnlyDecision.reason,
        options,
        scopeDefaults
      );
      if (responseFirstRoute) {
        return responseFirstRoute;
      }

      const intent = createIntent();
      intent.confidence = 1;
      intent.reason = clarifyOnlyDecision.reason;
      intent.signals = [clarifyOnlyDecision.signal];
      return {
        action: 'clarify',
        reason: clarifyOnlyDecision.reason,
        message: clarifyOnlyDecision.message,
        scope,
        intent,
        plan: buildRoutePlan(scope, intent),
        clarificationKind: clarifyOnlyDecision.clarificationKind || null,
        clarificationChoices: buildClarificationChoicesInternal(clarifyOnlyDecision.clarificationKind || null, session),
        resolvedQuestion: effectiveQuestion
      };
    }
  }

  let intent = options.intentOverride || classifyIntent(effectiveQuestion, scope);
  if (
    scopeDefaults.scopeWasDefaulted
    && options.preferResponseFirst
    && intent.kind === 'analysis'
    && !options.hasActiveClarificationProvider
  ) {
    intent = createForcedIntentInternal(chooseResponseFirstIntentKindInternal(effectiveQuestion, scope, 'needs_mode', options));
    assumptionText = buildResponseFirstAssumptionInternal(scope, intent.kind, {
      scopeWasDefaulted: true,
      modeWasDefaulted: true
    });
  } else if (!assumptionText && scopeDefaults.scopeWasDefaulted && intent.kind !== 'clarify') {
    assumptionText = buildResponseFirstAssumptionInternal(scope, intent.kind, {
      scopeWasDefaulted: true,
      modeWasDefaulted: false
    });
  }

  const plan = buildRoutePlan(scope, intent);

  if (intent.kind === 'clarify') {
    const responseFirstRoute = buildResponseFirstRouteInternal(
      effectiveQuestion,
      scope,
      session,
      intent.reason || scope.clarifyReason || 'unsupported',
      options,
      scopeDefaults
    );
    if (responseFirstRoute) {
      return responseFirstRoute;
    }

    const clarifyMessage = scope.clarification
      || (intent.reason === 'needs_context' ? 'De quel vote parlez-vous ?' : MODE_CLARIFICATION_MESSAGE);
    const clarificationKind = intent.reason === 'needs_mode'
      ? 'mode'
      : scope.clarification
        ? 'scope'
        : clarifyMessage === MODE_CLARIFICATION_MESSAGE
          ? 'mode'
          : null;
    return {
      action: 'clarify',
      message: clarifyMessage,
      reason: intent.reason || scope.clarifyReason || 'unsupported',
      scope,
      intent,
      plan,
      clarificationKind,
      clarificationChoices: buildClarificationChoicesInternal(clarificationKind, session),
      resolvedQuestion: effectiveQuestion
    };
  }

  if (intent.kind === 'analysis') {
    return {
      action: 'analysis_rag',
      scope,
      intent,
      plan,
      resolvedQuestion: effectiveQuestion,
      assumptionText
    };
  }

  return {
    action: 'deterministic',
    scope,
    intent,
    plan,
    resolvedQuestion: effectiveQuestion,
    assumptionText
  };
}

export function routeQuestion(question, session, options = {}) {
  const pendingResolution = options.skipPendingResolution
    ? null
    : resolvePendingClarification(question, session);
  if (pendingResolution) {
    return routeQuestionInternal(pendingResolution.question, session, {
      ...options,
      questionOverride: pendingResolution.question,
      scopeOverride: pendingResolution.scopeOverride,
      intentOverride: pendingResolution.intentOverride || null,
      assumptionText: pendingResolution.assumptionText || options.assumptionText || null
    });
  }

  return routeQuestionInternal(question, session, options);
}
