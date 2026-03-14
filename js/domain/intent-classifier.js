import { normalizeQuestion } from './vote-normalizer.js';
import { createIntent } from './router-primitives.js';
import {
  detectAnalysisRequest,
  detectComparativeThemeAnalysisRequest,
  detectClosedVoteQuestion,
  detectCountRequest,
  detectGroupAlignmentRequest,
  detectGroupDeviationRequest,
  detectListRequest,
  detectParticipationRateRequest,
  detectScrutinyDetailRequest,
  detectSubjectRequest,
  detectThematicStanceRequest,
} from './intent-detectors.js';

function hasConcreteQueryLookupRequest(normalizedQuestion, scope) {
  if (!scope?.filters?.queryText) {
    return false;
  }

  const searchQuestion = String(normalizedQuestion || '').replace(/['’-]/gu, ' ').replace(/-/g, ' ');
  return (
    /\bcomment\b[^?]{0,100}\bpositionn(?:e|ee|ees|es|er|ait)\b[^?]{0,50}\b(?:sur|concernant)\b/.test(searchQuestion) ||
    /\bcomment\b[^?]{0,100}\bvot(?:e|ent|ait|aient|er)\b[^?]{0,50}\b(?:sur|concernant)\b/.test(searchQuestion) ||
    /\bquel(?:le)?(?: a ete| est)?(?: le)? vote\b[^?]{0,40}\b(?:sur|concernant)\b/.test(searchQuestion) ||
    /\bquelle est (?:sa|la) position\b[^?]{0,40}\b(?:sur|concernant)\b/.test(searchQuestion)
  );
}

function hasRepresentativeAnalysisCue(normalizedQuestion) {
  const searchQuestion = String(normalizedQuestion || '').replace(/['’-]/gu, ' ').replace(/-/g, ' ');
  return /\b(resume|resumer|reveler|revele)\b[^?]{0,20}\ble mieux\b/.test(searchQuestion);
}

function assignIntent(intent, kind, signal, reason = null) {
  intent.kind = kind;
  intent.confidence = 1;
  if (signal) {
    intent.signals.push(signal);
  }
  if (reason) {
    intent.reason = reason;
  }
  return intent;
}

export function classifyIntent(question, scope) {
  const normalizedQuestion = normalizeQuestion(question);
  const intent = createIntent();
  const isClosedVoteQuestion = detectClosedVoteQuestion(question, scope);
  const participationFocus = detectParticipationRateRequest(normalizedQuestion);
  const isGroupAlignmentRequest = detectGroupAlignmentRequest(normalizedQuestion, scope);
  const isGroupDeviationRequest = detectGroupDeviationRequest(normalizedQuestion, scope);
  const isScrutinyDetailRequest = detectScrutinyDetailRequest(normalizedQuestion);
  const isComparativeAnalysisRequest = detectComparativeThemeAnalysisRequest(normalizedQuestion);
  const isConcreteQueryLookupRequest = hasConcreteQueryLookupRequest(normalizedQuestion, scope);
  const hasRepresentativeAnalysisRequest = hasRepresentativeAnalysisCue(normalizedQuestion);
  const hasConcreteScrutinyContext = Boolean(
    scope?.filters?.queryText ||
    (scope?.source === 'last_result' && Array.isArray(scope?.voteIds) && scope.voteIds.length === 1)
  );
  const hasExplicitListShape = detectListRequest(normalizedQuestion) || /\bquels?\s+(?:votes?|scrutins?)\b/.test(normalizedQuestion);
  const hasStructuredFilter = Boolean(
    scope?.filters?.queryText ||
    scope?.filters?.vote ||
    scope?.filters?.dateFrom ||
    scope?.filters?.dateTo ||
    scope?.filters?.limit
  );

  if (scope?.needsClarification) {
    return assignIntent(intent, 'clarify', 'follow_up_without_context', scope.clarifyReason || 'needs_context');
  }

  if (isScrutinyDetailRequest && !hasConcreteScrutinyContext) {
    return assignIntent(intent, 'clarify', 'scrutiny_detail_needs_context', 'needs_context');
  }

  if (detectCountRequest(normalizedQuestion)) {
    return assignIntent(intent, 'count', 'count');
  }

  if (participationFocus) {
    return assignIntent(intent, 'participation_rate', `participation_${participationFocus}`);
  }

  if (isGroupAlignmentRequest) {
    return assignIntent(intent, 'group_alignment', 'group_alignment');
  }

  if (isGroupDeviationRequest) {
    return assignIntent(intent, 'group_gap', 'group_gap');
  }

  if (isScrutinyDetailRequest) {
    return assignIntent(intent, 'scrutiny_detail', 'scrutiny_detail');
  }

  if (isConcreteQueryLookupRequest && !isComparativeAnalysisRequest) {
    return assignIntent(intent, 'list', 'query_lookup');
  }

  if (isComparativeAnalysisRequest || hasRepresentativeAnalysisRequest) {
    return assignIntent(intent, 'analysis', isComparativeAnalysisRequest ? 'comparative_analysis' : 'representative_analysis');
  }

  if (detectSubjectRequest(normalizedQuestion)) {
    return assignIntent(intent, 'subjects', 'subjects');
  }

  if (detectThematicStanceRequest(normalizedQuestion, scope)) {
    return assignIntent(intent, 'thematic_stance', 'thematic_stance');
  }

  if (isClosedVoteQuestion) {
    return assignIntent(intent, 'list', 'closed_vote');
  }

  if (hasExplicitListShape) {
    return assignIntent(intent, 'list', 'list');
  }

  if (detectAnalysisRequest(normalizedQuestion)) {
    return assignIntent(intent, 'analysis', 'analysis');
  }

  if (scope?.filters?.theme && !hasStructuredFilter) {
    return assignIntent(intent, 'analysis', 'theme_analysis');
  }

  if (scope?.filters?.queryText || hasStructuredFilter || scope?.filters?.theme) {
    return assignIntent(intent, 'list', 'structured_filters');
  }

  return assignIntent(intent, 'clarify', 'fallback_clarify', 'unsupported');
}
