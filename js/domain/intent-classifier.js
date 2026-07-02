import { normalizeQuestion } from './vote-normalizer.js';
import { createIntent } from './router-primitives.js';
import {
  detectAnalysisIntensifierRequest,
  detectAnalysisRequest,
  detectComparativeThemeAnalysisRequest,
  detectClosedVoteQuestion,
  detectCountRequest,
  detectGroupAlignmentRequest,
  detectGroupDeviationRequest,
  detectLawCritiqueRequest,
  detectListRequest,
  detectParticipationRateRequest,
  detectScrutinyDetailRequest,
  detectSubjectRequest,
  detectThematicStanceRequest,
} from './intent-detectors.js';

const INHERITABLE_QUESTION_TYPES = new Set(['list', 'count', 'subjects', 'analysis', 'participation_rate']);
const AMBIGUITY_MARGIN = 0.25;
const INHERITANCE_BLOCKING_SCORE = 4.5;
const ELLIPTICAL_STOPWORDS = new Set([
  'a', 'au', 'aux', 'ce', 'ces', 'cette', 'ceux', 'ci', 'concernant', 'contre', 'd', 'de', 'des',
  'du', 'elle', 'en', 'est', 'et', 'il', 'l', 'la', 'le', 'les', 'pour', 'propos', 'quel', 'quelle',
  'quelles', 'quels', 'sa', 'ses', 'son', 'sur', 't', 'un', 'une', 'vote', 'votes', 'scrutin', 'scrutins'
]);

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

function isEllipticalQuestionInternal(normalizedQuestion) {
  const contentTokens = String(normalizedQuestion || '')
    .replace(/['’-]/gu, ' ')
    .split(/[^a-z0-9]+/g)
    .filter(token => token && !ELLIPTICAL_STOPWORDS.has(token));
  return contentTokens.length <= 2;
}

function assignIntent(intent, kind, signal, reason = null, confidence = 1) {
  intent.kind = kind;
  intent.confidence = confidence;
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
  const isCountRequest = detectCountRequest(normalizedQuestion);
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

  // Le taux de participation est global au depute : il reste calculable meme sans
  // contexte de votes (suivi elliptique du type "Et son taux de participation ?").
  const participationBypassesClarification = Boolean(participationFocus && !isCountRequest);

  if (scope?.needsClarification && !participationBypassesClarification) {
    return assignIntent(intent, 'clarify', 'follow_up_without_context', scope.clarifyReason || 'needs_context');
  }

  if (isScrutinyDetailRequest && !hasConcreteScrutinyContext) {
    return assignIntent(intent, 'clarify', 'scrutiny_detail_needs_context', 'needs_context');
  }

  // Classification a score : chaque detecteur produit un candidat, les scores de base
  // reproduisent l'ordre historique de priorite, puis des ajustements contextuels
  // departagent les cas ambigus (au lieu du premier motif gagnant).
  const candidates = [];
  const addCandidate = (kind, score, signal) => candidates.push({ kind, score, signal });

  if (isCountRequest) {
    addCandidate('count', 10, 'count');
  }
  if (participationFocus) {
    addCandidate('participation_rate', 9.5, `participation_${participationFocus}`);
  }
  if (isGroupAlignmentRequest) {
    addCandidate('group_alignment', 9, 'group_alignment');
  }
  if (isGroupDeviationRequest) {
    addCandidate('group_gap', 8.5, 'group_gap');
  }
  if (isScrutinyDetailRequest) {
    addCandidate('scrutiny_detail', 8, 'scrutiny_detail');
  }
  if (detectLawCritiqueRequest(normalizedQuestion, scope)) {
    addCandidate('law_critique', 8.2, 'law_critique');
  }
  if (isConcreteQueryLookupRequest && !isComparativeAnalysisRequest) {
    addCandidate('list', 7.6, 'query_lookup');
  }
  if (isComparativeAnalysisRequest || hasRepresentativeAnalysisRequest) {
    addCandidate('analysis', 7, isComparativeAnalysisRequest ? 'comparative_analysis' : 'representative_analysis');
  }
  if (detectSubjectRequest(normalizedQuestion)) {
    addCandidate('subjects', 6.5, 'subjects');
  }
  if (detectThematicStanceRequest(normalizedQuestion, scope)) {
    addCandidate('thematic_stance', 6, 'thematic_stance');
  }
  if (isClosedVoteQuestion) {
    addCandidate('list', 5.5, 'closed_vote');
  }
  if (hasExplicitListShape) {
    addCandidate('list', 5, 'list');
  }
  if (detectAnalysisRequest(normalizedQuestion)) {
    addCandidate('analysis', 4.5, 'analysis');
  }
  if (scope?.filters?.theme && !hasStructuredFilter) {
    addCandidate('analysis', 4, 'theme_analysis');
  }
  if (scope?.filters?.queryText || hasStructuredFilter || scope?.filters?.theme) {
    addCandidate('list', 3.5, 'structured_filters');
  }

  // Un intensificateur ("vraiment", "en realite", "incitations"...) signale une demande
  // de jugement : il penalise la simple liste de sujets et pousse vers l'analyse
  // des qu'un ancrage concret (theme, texte, suivi) existe.
  const hasAnalysisIntensifier = detectAnalysisIntensifierRequest(normalizedQuestion);
  const hasAnalysisAnchor = Boolean(scope?.filters?.theme || scope?.filters?.queryText || scope?.isFollowUp);
  if (hasAnalysisIntensifier) {
    candidates.forEach(candidate => {
      if (candidate.signal === 'subjects') {
        candidate.score -= 3;
      }
    });
    if (hasAnalysisAnchor) {
      addCandidate('analysis', 7.5, 'analysis_intensifier');
    }
  }

  // Suivi elliptique ("et sur l'immigration ?", "et en 2024 ?") : reutiliser le type
  // de question du dernier plan quand la question n'apporte qu'un nouveau filtre.
  const inheritedQuestionType = scope?.isFollowUp && INHERITABLE_QUESTION_TYPES.has(scope?.inheritedQuestionType)
    ? scope.inheritedQuestionType
    : null;
  const hasNewFollowUpSignal = Boolean(
    scope?.filters?.theme ||
    scope?.filters?.vote ||
    scope?.filters?.dateFrom ||
    scope?.filters?.dateTo ||
    scope?.filters?.limit
  );
  if (inheritedQuestionType && hasNewFollowUpSignal && isEllipticalQuestionInternal(normalizedQuestion)) {
    const maxOtherScore = candidates.reduce((max, candidate) => Math.max(max, candidate.score), 0);
    if (maxOtherScore < INHERITANCE_BLOCKING_SCORE) {
      addCandidate(inheritedQuestionType, 6.8, 'inherited_follow_up');
    }
  }

  if (candidates.length === 0) {
    return assignIntent(intent, 'clarify', 'fallback_clarify', 'unsupported');
  }

  const rankedCandidates = [...candidates].sort((left, right) => right.score - left.score);
  const topCandidate = rankedCandidates[0];
  const secondCandidate = rankedCandidates.find(candidate => candidate.kind !== topCandidate.kind) || null;
  const confidence = secondCandidate
    ? Math.round((topCandidate.score / (topCandidate.score + secondCandidate.score)) * 100) / 100
    : 1;

  if (
    secondCandidate &&
    topCandidate.score - secondCandidate.score < AMBIGUITY_MARGIN &&
    !scope?.isFollowUp
  ) {
    return assignIntent(intent, 'clarify', 'ambiguous_intent', 'needs_mode', confidence);
  }

  return assignIntent(intent, topCandidate.kind, topCandidate.signal, null, confidence);
}
