import { classifyIntent } from './intent-classifier.js';
import { detectClarifyOnlyQuestion, detectUnsupportedQuestion } from './intent-detectors.js';
import { createIntent, createRoutePlan } from './router-primitives.js';
import { resolveScope } from './scope-resolver.js';

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

export function routeQuestion(question, session) {
  if (!session.activeDeputeId) {
    const intent = createIntent();
    intent.kind = 'clarify';
    intent.confidence = 1;
    intent.reason = 'needs_context';
    return {
      action: 'clarify',
      message: 'Choisissez d\'abord un depute.',
      intent,
      plan: buildRoutePlan(null, intent)
    };
  }

  const unsupportedDecision = detectUnsupportedQuestion(question);
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
      plan: buildRoutePlan(null, intent)
    };
  }

  const scope = resolveScope(question, session);
  const clarifyOnlyDecision = detectClarifyOnlyQuestion(question, scope);

  if (clarifyOnlyDecision) {
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
      plan: buildRoutePlan(scope, intent)
    };
  }

  const intent = classifyIntent(question, scope);
  const plan = buildRoutePlan(scope, intent);

  if (intent.kind === 'clarify') {
    const clarifyMessage = scope.clarification
      || (intent.reason === 'needs_context' ? 'De quel vote parlez-vous ?' : 'Voulez-vous une liste de votes, un comptage ou une analyse thematique ?');
    return {
      action: 'clarify',
      message: clarifyMessage,
      reason: intent.reason || scope.clarifyReason || 'unsupported',
      scope,
      intent,
      plan
    };
  }

  if (intent.kind === 'analysis') {
    return {
      action: 'analysis_rag',
      scope,
      intent,
      plan
    };
  }

  return {
    action: 'deterministic',
    scope,
    intent,
    plan
  };
}
