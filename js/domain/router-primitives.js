export function createScope() {
  return {
    source: 'depute_all',
    voteIds: null,
    isFollowUp: false,
    filters: {
      theme: null,
      vote: null,
      queryText: null,
      dateFrom: null,
      dateTo: null,
      limit: null,
      sort: 'date_desc'
    },
    needsClarification: false,
    clarification: null,
    clarifyReason: null
  };
}

export function createIntent() {
  return {
    kind: 'clarify',
    confidence: 0,
    signals: [],
    reason: null
  };
}

export function createRoutePlan() {
  return {
    questionType: 'clarify',
    candidateStrategy: 'none',
    requiresLlm: false,
    responseMode: 'clarify',
    unsupportedReason: null
  };
}
