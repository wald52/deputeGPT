#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const QUESTION_BANK_PATH = path.join(ROOT_DIR, 'tests', 'router', 'question-bank.jsonl');
const TEMPLATE_EXPECTATIONS_PATH = path.join(ROOT_DIR, 'tests', 'router', 'router-templates.json');
const QUESTION_OVERRIDES_PATH = path.join(ROOT_DIR, 'tests', 'router', 'question-bank-overrides.json');
const RAW_QUESTIONS_PATH = path.join(ROOT_DIR, 'docs', 'questions-brutes.md');
const LATEST_DEPUTES_PATH = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs', 'latest.json');
const DEPUTES_DIR = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs');
const VOTES_DIR = path.join(ROOT_DIR, 'public', 'data', 'votes');
const RAG_LEXICAL_INDEX_PATH = path.join(ROOT_DIR, 'public', 'data', 'rag', 'lexical_index.json');
const LEGACY_LEXICAL_INDEX_PATH = path.join(ROOT_DIR, 'public', 'data', 'search_index.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'test-results', 'router-audit');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRawQuestions() {
  return fs.readFileSync(RAW_QUESTIONS_PATH, 'utf8')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => /^-\s+/.test(line))
    .map(line => line.replace(/^-\s+/, '').trim());
}

function compareScopeFilters(expectedFilters = {}, actualFilters = {}) {
  const mismatches = [];

  for (const [key, expectedValue] of Object.entries(expectedFilters)) {
    const actualValue = actualFilters?.[key];
    if (Array.isArray(expectedValue)) {
      const actualArray = Array.isArray(actualValue) ? actualValue : [];
      const sameArray = expectedValue.length === actualArray.length
        && expectedValue.every((value, index) => value === actualArray[index]);
      if (!sameArray) {
        mismatches.push({ key, expected: expectedValue, actual: actualValue });
      }
      continue;
    }

    if (expectedValue !== actualValue) {
      mismatches.push({ key, expected: expectedValue, actual: actualValue });
    }
  }

  return mismatches;
}

function createExpectationForQuestion(question, templateExpectations, questionOverrides) {
  return {
    ...(templateExpectations[question.template_id] || {}),
    ...(questionOverrides[question.id] || {})
  };
}

function formatFinding(kind, question, expected, route, extra = {}) {
  return {
    id: question.id,
    template_id: question.template_id,
    question: question.question,
    kind,
    expected,
    actual: {
      action: route.action,
      reason: route.reason || null,
      intent_kind: route.intent?.kind || null,
      scope_filters: route.scope?.filters || {}
    },
    ...extra
  };
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT_DIR, relativePath)).href);
}

async function buildRuntimeHelpers() {
  const [
    routerModule,
    deterministicResponsesModule,
    deterministicRouterModule,
    themeHelpersModule,
    queryDisplayModule,
    filterDescriptionsModule,
    voteNormalizerModule,
    voteMetadataModule,
    routerConstantsModule,
    intentDetectorsModule,
    analysisContextModule,
    voteHelpersModule
  ] = await Promise.all([
    importModule('js/domain/router.js'),
    importModule('js/domain/deterministic-responses.js'),
    importModule('js/domain/deterministic-router.js'),
    importModule('js/domain/theme-helpers.js'),
    importModule('js/domain/query-display.js'),
    importModule('js/domain/filter-descriptions.js'),
    importModule('js/domain/vote-normalizer.js'),
    importModule('js/domain/vote-metadata.js'),
    importModule('js/domain/router-constants.js'),
    importModule('js/domain/intent-detectors.js'),
    importModule('js/domain/analysis-context.js'),
    importModule('js/domain/vote-helpers.js')
  ]);

  const latest = loadJson(LATEST_DEPUTES_PATH);
  const deputesPayload = loadJson(path.join(DEPUTES_DIR, `${latest.version}.json`));
  const deputes = deputesPayload.deputes || deputesPayload;
  const depute = deputes.find(entry => entry.id === 'PA1008') || deputes[0];
  const votes = loadJson(path.join(VOTES_DIR, `${depute.id}.json`));
  const searchIndexPath = fs.existsSync(RAG_LEXICAL_INDEX_PATH) ? RAG_LEXICAL_INDEX_PATH : LEGACY_LEXICAL_INDEX_PATH;
  const searchIndex = loadJson(searchIndexPath);

  const deputeWithVotes = {
    ...depute,
    votes
  };

  const lookupVoteMetadata = vote => voteMetadataModule.getVoteMetadata(vote, searchIndex);
  const lookupVoteSubject = vote => voteMetadataModule.getVoteSubject(vote, searchIndex);
  const lookupVoteIndexText = vote => voteMetadataModule.getVoteIndexText(vote, searchIndex);

  const themeHelpers = themeHelpersModule.createThemeHelpers({
    normalizeQuestion: voteNormalizerModule.normalizeQuestion,
    themeCategoryAliases: routerConstantsModule.THEME_CATEGORY_ALIASES,
    themeKeywords: routerConstantsModule.THEME_KEYWORDS,
    lookupVoteMetadata,
    lookupVoteSubject
  });

  const queryHelpers = queryDisplayModule.createQueryDisplayHelpers({
    getVoteId: voteNormalizerModule.getVoteId,
    lookupVoteSubject,
    normalizeQuestion: voteNormalizerModule.normalizeQuestion,
    extractTargetQueryTokens: deterministicRouterModule.extractTargetQueryTokens
  });

  const filterHelpers = filterDescriptionsModule.createFilterDescriptionHelpers({
    describeQueryVotePhrase: queryHelpers.describeQueryVotePhrase
  });

  const applyScopeFilters = deterministicRouterModule.createScopedFiltersApplier({
    lookupVoteMetadata,
    lookupVoteIndexText,
    lookupVoteSubject,
    extractQueryDisplayLabelFromVote: queryHelpers.extractQueryDisplayLabelFromVote
  });

  const executeDeterministicRoute = deterministicResponsesModule.createDeterministicRouteExecutor({
    applyScopeFilters,
    buildLargeListClarification: totalMatches => `Plus de ${totalMatches} votes correspondent. Precisez un theme, une periode ou un texte.`,
    defaultChatListLimit: routerConstantsModule.DEFAULT_CHAT_LIST_LIMIT,
    describeClosedVoteTarget: filterHelpers.describeClosedVoteTarget,
    describeDateFilter: filterHelpers.describeDateFilter,
    describeQueryFilter: queryHelpers.describeQueryFilter,
    describeQueryVotePhrase: queryHelpers.describeQueryVotePhrase,
    detectClosedVoteQuestion: intentDetectorsModule.detectClosedVoteQuestion,
    detectThemeSummaryRequest: intentDetectorsModule.detectThemeSummaryRequest,
    findGlobalVotesByQuery: queryText => deterministicRouterModule.findGlobalVotesByQuery(queryText, searchIndex, {
      lookupVoteIndexText,
      lookupVoteSubject,
      extractQueryDisplayLabelFromVote: queryHelpers.extractQueryDisplayLabelFromVote
    }),
    formatVoteLine: vote => `${vote.date} ${vote.numero} ${vote.vote} ${vote.titre}`,
    getVoteId: voteNormalizerModule.getVoteId,
    inferVoteThemeLabel: themeHelpers.inferVoteThemeLabel,
    normalizeQuestion: voteNormalizerModule.normalizeQuestion,
    resolveScopeVotes: deterministicRouterModule.resolveScopeVotes,
    shouldClarifyLargeList: deterministicRouterModule.shouldClarifyLargeList,
    thematicStanceExampleLimit: 4
  });

  const buildAnalysisContextVotes = async (route, question, deputeVotes) => analysisContextModule.computeAnalysisContextVotes(route, question, deputeVotes, {
    resolveScopeVotes: deterministicRouterModule.resolveScopeVotes,
    applyScopeFilters,
    dedupeVotes: voteHelpersModule.dedupeVotes,
    rankVotesForAnalysis: filteredVotes => filteredVotes,
    contextMinVotes: 6,
    contextVoteLimit: 18
  });

  return {
    routeQuestion: routerModule.routeQuestion,
    executeDeterministicRoute,
    buildAnalysisContextVotes,
    depute: deputeWithVotes
  };
}

function auditQuestionBank(runtime, templateExpectations, questionOverrides) {
  const questions = loadJsonl(QUESTION_BANK_PATH);
  const findings = [];
  const summary = {
    total_questions: questions.length,
    action_counts: {
      deterministic: 0,
      analysis_rag: 0,
      clarify: 0
    },
    findings_by_kind: {}
  };

  for (const question of questions) {
    const expected = createExpectationForQuestion(question, templateExpectations, questionOverrides);
    const route = runtime.routeQuestion(question.question, { activeDeputeId: runtime.depute.id });
    summary.action_counts[route.action] = (summary.action_counts[route.action] || 0) + 1;

    if (expected.expected_route_action && route.action !== expected.expected_route_action) {
      findings.push(formatFinding('action_mismatch', question, expected, route));
      continue;
    }

    if (route.action === 'clarify' && expected.clarify_reason && route.reason !== expected.clarify_reason) {
      findings.push(formatFinding('reason_mismatch', question, expected, route));
      continue;
    }

    if (expected.expected_intent_kind && route.intent?.kind !== expected.expected_intent_kind) {
      findings.push(formatFinding('intent_mismatch', question, expected, route));
      continue;
    }

    if (expected.expected_scope_filters) {
      const scopeMismatches = compareScopeFilters(expected.expected_scope_filters, route.scope?.filters || {});
      if (scopeMismatches.length > 0) {
        findings.push(formatFinding('scope_mismatch', question, expected, route, { scope_mismatches: scopeMismatches }));
      }
    }
  }

  findings.forEach(finding => {
    summary.findings_by_kind[finding.kind] = (summary.findings_by_kind[finding.kind] || 0) + 1;
  });

  return {
    summary,
    findings
  };
}

function auditRawArchive() {
  const structuredQuestions = new Set(loadJsonl(QUESTION_BANK_PATH).map(entry => entry.question));
  const rawQuestions = readRawQuestions().filter(question => /[?？]$/u.test(question));
  const exactMatches = rawQuestions.filter(question => structuredQuestions.has(question));
  const unmatched = rawQuestions.filter(question => !structuredQuestions.has(question));

  return {
    raw_questions_total: rawQuestions.length,
    exact_matches_in_bank: exactMatches.length,
    unmatched_raw_questions: unmatched.length,
    unmatched_examples: unmatched.slice(0, 20)
  };
}

async function auditManualScenarios(runtime) {
  const largeListRoute = runtime.routeQuestion('Liste les votes de ce depute.', { activeDeputeId: runtime.depute.id });
  const largeListResult = largeListRoute.action === 'deterministic'
    ? runtime.executeDeterministicRoute(largeListRoute, 'Liste les votes de ce depute.', runtime.depute)
    : { kind: 'route_error' };

  const boundedListRoute = runtime.routeQuestion('Liste les 5 derniers votes de ce depute.', { activeDeputeId: runtime.depute.id });
  const boundedListResult = boundedListRoute.action === 'deterministic'
    ? runtime.executeDeterministicRoute(boundedListRoute, 'Liste les 5 derniers votes de ce depute.', runtime.depute)
    : { kind: 'route_error' };

  const followUpSession = {
    activeDeputeId: runtime.depute.id,
    lastResultVoteIds: boundedListResult.displayedVoteIds || [],
    lastTheme: boundedListRoute.scope?.filters?.theme || null,
    lastDateRange: {
      dateFrom: boundedListRoute.scope?.filters?.dateFrom || null,
      dateTo: boundedListRoute.scope?.filters?.dateTo || null
    }
  };
  const followUpRoute = runtime.routeQuestion('Quels sont les sujets de ces votes ?', followUpSession);

  const analysisQuestion = 'Ses votes sur le logement repondent-ils a la crise actuelle du secteur ?';
  const analysisRoute = runtime.routeQuestion(analysisQuestion, { activeDeputeId: runtime.depute.id });
  const analysisContextVotes = analysisRoute.action === 'analysis_rag'
    ? await runtime.buildAnalysisContextVotes(analysisRoute, analysisQuestion, runtime.depute.votes)
    : [];

  const scenarios = [
    {
      id: 'large_list_clarifies',
      passed: largeListRoute.action === 'deterministic' && largeListResult.kind === 'clarify',
      details: {
        route_action: largeListRoute.action,
        result_kind: largeListResult.kind
      }
    },
    {
      id: 'bounded_list_is_deterministic',
      passed: boundedListRoute.action === 'deterministic' && boundedListResult.kind === 'response',
      details: {
        route_action: boundedListRoute.action,
        result_kind: boundedListResult.kind,
        displayed_vote_ids: boundedListResult.displayedVoteIds?.length || 0
      }
    },
    {
      id: 'follow_up_reuses_scope',
      passed: followUpRoute.action === 'deterministic' && followUpRoute.scope?.source === 'last_result',
      details: {
        route_action: followUpRoute.action,
        scope_source: followUpRoute.scope?.source || null
      }
    },
    {
      id: 'analysis_theme_has_dated_context',
      passed: analysisRoute.action === 'analysis_rag' && analysisContextVotes.length > 0 && analysisContextVotes.every(vote => Boolean(vote?.date)),
      details: {
        route_action: analysisRoute.action,
        context_votes: analysisContextVotes.length,
        dated_votes: analysisContextVotes.filter(vote => Boolean(vote?.date)).length
      }
    }
  ];

  return {
    scenarios,
    passed: scenarios.every(entry => entry.passed)
  };
}

async function main() {
  ensureDir(REPORTS_DIR);

  const runtime = await buildRuntimeHelpers();
  const templateExpectations = loadJson(TEMPLATE_EXPECTATIONS_PATH);
  const questionOverrides = fs.existsSync(QUESTION_OVERRIDES_PATH) ? loadJson(QUESTION_OVERRIDES_PATH) : {};

  const questionBankAudit = auditQuestionBank(runtime, templateExpectations, questionOverrides);
  const rawArchiveAudit = auditRawArchive();
  const manualScenariosAudit = await auditManualScenarios(runtime);

  const report = {
    generated_at: new Date().toISOString(),
    question_bank: questionBankAudit.summary,
    raw_archive: rawArchiveAudit,
    manual_scenarios: manualScenariosAudit
  };

  writeJson(path.join(REPORTS_DIR, 'question-bank-summary.json'), report);
  writeJson(path.join(REPORTS_DIR, 'question-bank-findings.json'), questionBankAudit.findings);

  console.log(`Question bank: ${questionBankAudit.summary.total_questions} questions, ${questionBankAudit.findings.length} ecarts.`);
  console.log(`Archive brute: ${rawArchiveAudit.raw_questions_total} puces, ${rawArchiveAudit.exact_matches_in_bank} exactes, ${rawArchiveAudit.unmatched_raw_questions} non instanciees.`);
  console.log(`Scenarios manuels: ${manualScenariosAudit.scenarios.filter(entry => entry.passed).length}/${manualScenariosAudit.scenarios.length} passes.`);

  if (questionBankAudit.findings.length > 0 || !manualScenariosAudit.passed) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
