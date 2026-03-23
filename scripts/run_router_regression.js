#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const RUNTIME_PATH = path.join(ROOT_DIR, 'js', 'app-runtime.js');
const LATEST_DEPUTES_PATH = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs', 'latest.json');
const VERSIONED_DEPUTES_DIR = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs');
const VOTES_DIR = path.join(ROOT_DIR, 'public', 'data', 'votes');
const RAG_LEXICAL_INDEX_PATH = path.join(ROOT_DIR, 'public', 'data', 'rag', 'lexical_index.json');
const LEGACY_LEXICAL_INDEX_PATH = path.join(ROOT_DIR, 'public', 'data', 'search_index.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'test-results', 'router-regression');
const DEFAULT_RECENT_LIMIT = 12;
const LARGE_RESULT_THRESHOLD = 20;

const DOCUMENT_TYPE_PATTERNS = [
  { type: 'proposition_de_resolution_europeenne', regex: /proposition de r[ée]solution europ[ée]enne/iu },
  { type: 'resolution_europeenne', regex: /r[ée]solution europ[ée]enne/iu },
  { type: 'projet_de_loi', regex: /projet de loi/iu },
  { type: 'proposition_de_loi', regex: /proposition de loi/iu },
  { type: 'declaration', regex: /d[ée]claration(?: du gouvernement)?/iu },
  { type: 'resolution', regex: /r[ée]solution/iu },
  { type: 'motion', regex: /motion/iu },
  { type: 'traite', regex: /trait[ée]/iu },
  { type: 'amendement', regex: /amendement/iu },
  { type: 'article', regex: /article/iu },
  { type: 'loi', regex: /\bloi\b/iu }
];

const EXACT_DOCUMENT_TYPE_PATTERNS = [
  { type: 'declaration', regex: /d[ée]claration(?: du gouvernement)?/iu },
  { type: 'motion', regex: /motion/iu },
  { type: 'amendement', regex: /amendement/iu },
  { type: 'article', regex: /article/iu },
  { type: 'projet_de_loi', regex: /projet de loi/iu },
  { type: 'proposition_de_loi', regex: /proposition de loi/iu },
  { type: 'resolution', regex: /r[ée]solution(?: europ[ée]enne)?/iu },
  { type: 'traite', regex: /trait[ée]/iu },
  { type: 'loi', regex: /\bloi\b/iu }
];

const DOCUMENT_TYPE_QUERY_LABELS = {
  projet_de_loi: 'projet de loi',
  proposition_de_loi: 'proposition de loi',
  traite: 'traite',
  motion: 'motion',
  declaration: 'declaration',
  resolution: 'resolution',
  amendement: 'amendement',
  article: 'article',
  loi: 'loi'
};

const CATEGORY_TO_THEME = {
  agriculture: 'agriculture',
  fiscal: 'budget',
  immigration: 'immigration',
  logement: 'logement',
  'outre-mer': 'outre-mer',
  'numérique': 'numerique',
  'santé': 'sante',
  'éducation': 'education',
  environnement: 'ecologie',
  transport: 'securite',
  'sécurité': 'securite',
  'défense': 'defense',
  travail: 'emploi'
};

const KEYWORD_THEME_CASES = [
  {
    theme: 'fin de vie',
    questionTheme: 'la fin de vie',
    keywords: ['fin de vie', 'aide a mourir', 'soins palliatifs', 'suicide assiste', 'euthanasie']
  }
];

const MONTHS_FR = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

const FAILURE_PRIORITY = [
  'action_mismatch',
  'intent_mismatch',
  'follow_up_scope_mismatch',
  'scope_mismatch',
  'result_kind_mismatch',
  'polarity_mismatch',
  'missing_vote_ids',
  'unexpected_vote_ids',
  'reason_missing'
];

const SUPPLEMENTAL_DOCUMENT_TYPES = ['loi', 'projet_de_loi', 'proposition_de_loi', 'traite', 'motion', 'declaration', 'resolution', 'amendement', 'article'];

const ORACLE_QUERY_STOPWORDS = new Set([
  'article', 'articles', 'amendement', 'amendements', 'declaration', 'declarations',
  'motion', 'motions', 'projet', 'projets', 'proposition', 'propositions', 'resolution',
  'resolutions', 'loi', 'lois', 'traite', 'traites', 'texte', 'textes', 'lecture', 'lectures',
  'premiere', 'deuxieme', 'nouvelle', 'definitive', 'gouvernement', 'ensemble', 'portant',
  'visant', 'relative', 'relatif', 'relatifs', 'relatives', 'application', 'constitution',
  'commission', 'mixte', 'paritaire', 'examen', 'prioritaire', 'appelant', 'suivant', 'suivants'
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(REPORTS_DIR);

  const data = loadDataset();
  const harness = await createRuntimeHarness(options.runtimePath || RUNTIME_PATH, data.searchIndex);
  const runner = createRunner(options, data, harness);
  await runner.run();
}

function parseArgs(argv) {
  const options = {
    label: null,
    comparePath: null,
    deputeId: null,
    limitDeputies: null,
    runtimePath: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--label') {
      options.label = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (value === '--compare') {
      options.comparePath = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (value === '--depute') {
      options.deputeId = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (value === '--limit-deputies') {
      const rawLimit = Number(argv[index + 1]);
      options.limitDeputies = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
      index += 1;
      continue;
    }

    if (value === '--runtime-path') {
      options.runtimePath = argv[index + 1] ? path.resolve(ROOT_DIR, argv[index + 1]) : null;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.label) {
    const now = new Date();
    const stamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0')
    ].join('');
    options.label = `run-${stamp}`;
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/run_router_regression.js --label baseline',
    '  node scripts/run_router_regression.js --label after-fixes --compare test-results/router-regression/baseline/summary.json',
    '  node scripts/run_router_regression.js --label smoke --depute PA1008',
    '  node scripts/run_router_regression.js --label smoke --limit-deputies 20',
    '  node scripts/run_router_regression.js --label baseline --runtime-path temp/router-baseline.js'
  ].join('\n'));
}

function loadDataset() {
  const latest = loadJson(LATEST_DEPUTES_PATH);
  const deputiesFilePath = path.join(VERSIONED_DEPUTES_DIR, `${latest.version}.json`);
  const deputes = loadJson(deputiesFilePath);
  const searchIndexPath = fs.existsSync(RAG_LEXICAL_INDEX_PATH) ? RAG_LEXICAL_INDEX_PATH : LEGACY_LEXICAL_INDEX_PATH;
  const searchIndex = loadJson(searchIndexPath);
  const searchIndexEntries = Object.entries(searchIndex.votes || {}).map(([numero, data]) => {
    const titre = String(data.titre || '');
    return {
      numero,
      titre,
      summary: String(data.summary || ''),
      category: String(data.category || ''),
      date: String(data.date || ''),
      normalizedTitle: normalizeText(titre),
      normalizedSummary: normalizeText(data.summary || ''),
      normalizedCategory: normalizeText(data.category || ''),
      exactQuery: extractExactQueryFromTitle(titre),
      exactType: detectDocumentType(extractExactQueryFromTitle(titre) || titre, EXACT_DOCUMENT_TYPE_PATTERNS),
      familyQuery: extractDocumentFamilyQuery(titre),
      familyType: detectDocumentType(extractDocumentFamilyQuery(titre) || titre, DOCUMENT_TYPE_PATTERNS)
    };
  }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));

  return {
    deputes,
    searchIndex,
    searchIndexEntries
  };
}

async function createRuntimeHarness(runtimePath, searchIndex) {
  const runtimeFilePath = path.resolve(runtimePath);
  const source = bundleLocalScript(runtimeFilePath)
    .replace(/\ninit\(\);\s*$/u, '\n');
  const harnessSuffix = `
;globalThis.__DEPUTEGPT_ROUTER_HARNESS__ = {
  resolveScope,
  classifyIntent,
  routeQuestion,
  executeDeterministicRoute,
  updateSessionFromResult,
  buildAnalysisContextVotes,
  buildDeterministicMessageMetadata,
  buildScopeActionRoute,
  getVoteId,
  __setCurrentDepute(value) { currentDepute = value; },
  __applyChatSessionState(value) { Object.assign(chatSessionState, value || {}); },
  __setSearchIndex(value) { searchIndex = value; },
  __setSearchIndexLoaded(value) { searchIndexLoaded = value; },
  __setMiniSearch(value) { miniSearch = value; }
};
`;

  const sandbox = {
    console,
    globalThis: null,
    window: {
      location: { href: 'http://localhost/' },
      matchMedia() {
        return {
          matches: false,
          media: '',
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() { return false; }
        };
      },
      addEventListener() {},
      removeEventListener() {}
    },
    self: { crossOriginIsolated: false },
    document: {
      getElementById() { return null; },
      createElement() {
        return {
          style: {},
          dataset: {},
          appendChild() {},
          addEventListener() {},
          removeEventListener() {},
          remove() {},
          classList: {
            add() {},
            remove() {},
            contains() { return false; }
          }
        };
      },
      body: {
        appendChild() {}
      }
    },
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    navigator: {
      hardwareConcurrency: 4
    },
    fetch: async () => {
      throw new Error('fetch non disponible dans le harness Node');
    },
    URL,
    Date,
    Intl,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    confirm() { return false; },
    alert() {}
  };

  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(`${source}\n${harnessSuffix}`, sandbox, { filename: 'app-runtime.js' });

  const harness = sandbox.__DEPUTEGPT_ROUTER_HARNESS__;
  harness.__setSearchIndex(searchIndex);
  harness.__setSearchIndexLoaded(false);
  harness.__setMiniSearch(null);
  return harness;
}

function bundleLocalScript(entryPath) {
  const bundledPaths = new Set();

  const resolveModulePath = (fromPath, specifier) => {
    const resolvedPath = path.resolve(path.dirname(fromPath), specifier);
    return path.extname(resolvedPath) ? resolvedPath : `${resolvedPath}.js`;
  };

  const buildModule = modulePath => {
    const resolvedPath = path.resolve(modulePath);
    if (bundledPaths.has(resolvedPath)) {
      return '';
    }

    bundledPaths.add(resolvedPath);

    let prefix = '';
    let source = fs.readFileSync(resolvedPath, 'utf8');

    source = source.replace(/^export\s*\{([^}]+)\}\s*from\s*['"](.+?)['"];\s*$/gmu, (_match, _imports, specifier) => {
      prefix += buildModule(resolveModulePath(resolvedPath, specifier));
      return '';
    });

    source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"](.+?)['"];\s*$/gmu, (_match, imports, specifier) => {
      prefix += buildModule(resolveModulePath(resolvedPath, specifier));

      const aliasLines = imports
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => {
          const parts = value.split(/\s+as\s+/u).map(part => part.trim());
          if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
            return '';
          }

          return `const ${parts[1]} = ${parts[0]};`;
        })
        .filter(Boolean);

      return aliasLines.length ? `${aliasLines.join('\n')}\n` : '';
    });

    source = source.replace(/^export\s+(async function|function|const|let|class)\s+/gmu, '$1 ');
    source = source.replace(/^export\s+default\s+/gmu, '');
    source = source.replace(/^export\s*\{[^}]+\};?\s*$/gmu, '');

    return `${prefix}\n${source}\n`;
  };

  return buildModule(entryPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFile(filePath, value) {
  fs.writeFileSync(filePath, value, 'utf8');
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’]/gu, '\'')
    .replace(/\s+/gu, ' ')
    .trim();
}

function sanitizeId(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeForReport(value) {
  return cloneData(value);
}

function sortVotesByDate(votes, sort = 'date_desc') {
  return [...(votes || [])].sort((left, right) => {
    const leftDate = String(left?.date || '');
    const rightDate = String(right?.date || '');
    return sort === 'date_asc'
      ? leftDate.localeCompare(rightDate)
      : rightDate.localeCompare(leftDate);
  });
}

function pushMapArray(targetMap, key, value) {
  const current = targetMap.get(key) || [];
  current.push(value);
  targetMap.set(key, current);
}

function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function formatFrenchDate(isoDate) {
  const parts = parseIsoDate(isoDate);
  if (!parts) {
    return isoDate;
  }

  return `${parts.day} ${MONTHS_FR[parts.month - 1]} ${parts.year}`;
}

function formatFrenchDateWithoutYear(isoDate) {
  const parts = parseIsoDate(isoDate);
  if (!parts) {
    return isoDate;
  }

  return `${parts.day} ${MONTHS_FR[parts.month - 1]}`;
}

function formatNumericDate(isoDate) {
  const parts = parseIsoDate(isoDate);
  if (!parts) {
    return isoDate;
  }

  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function formatMonthYearText(monthText) {
  const match = String(monthText || '').match(/^(\d{4})-(\d{2})$/u);
  if (!match) {
    return monthText;
  }

  return `${MONTHS_FR[Number(match[2]) - 1]} ${match[1]}`;
}

function formatMonthName(monthText) {
  const match = String(monthText || '').match(/^(\d{4})-(\d{2})$/u);
  if (!match) {
    return monthText;
  }

  return MONTHS_FR[Number(match[2]) - 1];
}

function monthToRange(monthText) {
  const match = String(monthText || '').match(/^(\d{4})-(\d{2})$/u);
  if (!match) {
    return {
      dateFrom: null,
      dateTo: null
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
}

function formatHumanDateDescription(dateFrom, dateTo) {
  if (dateFrom === dateTo) {
    return `le ${formatFrenchDate(dateFrom)}`;
  }

  const fromMonth = String(dateFrom || '').slice(0, 7);
  const toMonth = String(dateTo || '').slice(0, 7);
  if (fromMonth && fromMonth === toMonth) {
    return `en ${formatMonthYearText(fromMonth)}`;
  }

  return `entre le ${formatFrenchDate(dateFrom)} et le ${formatFrenchDate(dateTo)}`;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatSignedPercent(value) {
  const number = Number(value || 0) * 100;
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(2)}%`;
}

function extractExactQueryFromTitle(title) {
  const rawTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (!rawTitle) {
    return '';
  }

  for (const pattern of EXACT_DOCUMENT_TYPE_PATTERNS) {
    const match = rawTitle.match(pattern.regex);
    if (match && Number.isInteger(match.index)) {
      return rawTitle
        .slice(match.index)
        .replace(/[.]+$/u, '')
        .trim();
    }
  }

  return '';
}

function extractDocumentFamilyQuery(title) {
  const rawTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (!rawTitle) {
    return '';
  }

  for (const pattern of DOCUMENT_TYPE_PATTERNS) {
    const match = rawTitle.match(pattern.regex);
    if (match && Number.isInteger(match.index)) {
      return rawTitle
        .slice(match.index)
        .replace(/\s+\([^)]*\).*$/u, '')
        .replace(/[.]+$/u, '')
        .trim();
    }
  }

  return '';
}

function detectDocumentType(value, patterns) {
  const rawValue = String(value || '');
  for (const pattern of patterns) {
    if (pattern.regex.test(rawValue)) {
      return pattern.type;
    }
  }
  return null;
}

function normalizeSupplementalType(value) {
  if (value === 'proposition_de_resolution_europeenne' || value === 'resolution_europeenne') {
    return 'resolution';
  }
  return value;
}

function cleanupDerivedQuery(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/u, '')
    .trim();
}

function extractLawReferenceQuery(title) {
  const rawTitle = String(title || '');
  const match = rawTitle.match(/\bloi\s+n[°o]\s*[\d-]+[^.]+/iu);
  return match ? cleanupDerivedQuery(match[0]) : '';
}

function extractTreatyReferenceQuery(title) {
  const rawTitle = String(title || '');
  const patterns = [
    /\baccord d'association[^.()]+/iu,
    /\baccord[^.()]+/iu,
    /\bconvention[^.()]+/iu,
    /\btrait[ée]\b[^.()]+/iu
  ];

  for (const pattern of patterns) {
    const match = rawTitle.match(pattern);
    if (match) {
      return cleanupDerivedQuery(match[0]);
    }
  }

  return '';
}

function buildSupplementalDerivedCase(documentType, depute, vote, queryText) {
  return {
    depute,
    case: {
      id: `document_target_${documentType}__${depute.id}`,
      category: 'document_target',
      meta: {
        documentType
      },
      steps: [
        {
          question: `montre les votes sur ${queryText}`,
          expected: {
            routeAction: 'deterministic',
            intentKind: 'list',
            filters: {
              queryText,
              sort: 'date_desc'
            },
            filtersAbsent: ['dateFrom', 'dateTo'],
            resultKind: 'response',
            displayedVoteIdsInclude: [getVoteId(vote)],
            voteIdsInclude: [getVoteId(vote)]
          }
        }
      ]
    }
  };
}

function buildAbsentQueryText(queryText, exactType) {
  const typeLabel = DOCUMENT_TYPE_QUERY_LABELS[normalizeSupplementalType(exactType)];
  if (!typeLabel) {
    return '';
  }

  const significantTokens = normalizeText(queryText)
    .split(/[^a-z0-9]+/u)
    .filter(token => token && token.length >= 5 && !['projet', 'proposition', 'resolution', 'declaration', 'amendement', 'article', 'motion', 'traite', 'votes', 'vote'].includes(token));

  if (significantTokens.length < 2) {
    return `${typeLabel} synthetic regression`;
  }

  const reversedTokens = significantTokens.slice(0, 2).map(token => token.split('').reverse().join(''));
  return `${typeLabel} ${reversedTokens.join(' ')}`;
}

function getVoteId(vote) {
  if (!vote) {
    return '';
  }

  if (vote.__voteId) {
    return String(vote.__voteId);
  }

  if (vote.numero !== undefined && vote.numero !== null && String(vote.numero).trim()) {
    return String(vote.numero).trim();
  }

  return `${vote.date || ''}|${vote.titre || ''}|${vote.vote || ''}`;
}

function createSession(activeDeputeId) {
  return {
    activeDeputeId,
    lastResultVoteIds: [],
    lastResultQuery: '',
    lastFilters: null,
    lastSort: 'date_desc',
    lastLimit: null,
    lastScopeSource: 'depute_all',
    lastTheme: null,
    lastDateRange: null
  };
}

function compareIdLists(expectedIds, actualIds) {
  const expected = Array.isArray(expectedIds) ? expectedIds.map(String) : [];
  const actual = Array.isArray(actualIds) ? actualIds.map(String) : [];
  return {
    missing: expected.filter((voteId, index) => actual[index] !== voteId),
    unexpected: actual.filter((voteId, index) => expected[index] !== voteId)
  };
}

function compareIncludedIds(expectedIds, actualIds) {
  const expected = Array.isArray(expectedIds) ? expectedIds.map(String) : [];
  const actualSet = new Set(Array.isArray(actualIds) ? actualIds.map(String) : []);
  return expected.filter(voteId => !actualSet.has(voteId));
}

function messageIncludesFragment(message, fragment) {
  return normalizeText(message).includes(normalizeText(fragment));
}

function containsStandaloneYear(value) {
  return /\b20\d{2}\b/u.test(String(value || ''));
}

function getOracleQueryLabel(vote) {
  if (!vote) {
    return '';
  }

  return String(vote.__exactQuery || extractExactQueryFromTitle(vote.titre || '') || vote.titre || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOracleQueryTokens(queryText) {
  return normalizeText(queryText)
    .split(/[^a-z0-9]+/u)
    .filter(token => token && (token.length >= 4 || /^\d+$/u.test(token)) && !ORACLE_QUERY_STOPWORDS.has(token));
}

function filterOracleVotesByQuery(votes, queryText) {
  if (!queryText || !Array.isArray(votes) || votes.length === 0) {
    return [...(votes || [])];
  }

  const normalizedQuery = normalizeText(queryText);
  const queryTokens = extractOracleQueryTokens(queryText);
  const distinctiveTokens = queryTokens.filter(token => !/^\d+$/u.test(token));
  const requiredNumericTokens = queryTokens.filter(token => /^\d+$/u.test(token) && !/^20\d{2}$/u.test(token));
  const minimumMatchedTokens = queryTokens.length <= 2
    ? queryTokens.length
    : Math.max(2, Math.ceil(queryTokens.length / 2));
  const minimumDistinctiveTokens = distinctiveTokens.length <= 1
    ? distinctiveTokens.length
    : Math.max(2, Math.ceil(distinctiveTokens.length / 2));

  return votes.filter(vote => {
    const label = normalizeText(getOracleQueryLabel(vote));
    const title = normalizeText(vote?.titre || '');
    const haystack = `${label} ${title}`.trim();

    if (!haystack) {
      return false;
    }

    if (label === normalizedQuery || title === normalizedQuery) {
      return true;
    }

    if (label.includes(normalizedQuery) || title.includes(normalizedQuery)) {
      return true;
    }

    if (requiredNumericTokens.length > 0 && !requiredNumericTokens.every(token => haystack.includes(token))) {
      return false;
    }

    let matchedTokens = 0;
    queryTokens.forEach(token => {
      if (haystack.includes(token)) {
        matchedTokens += 1;
      }
    });

    if (matchedTokens < minimumMatchedTokens) {
      return false;
    }

    if (minimumDistinctiveTokens > 0) {
      let matchedDistinctiveTokens = 0;
      distinctiveTokens.forEach(token => {
        if (haystack.includes(token)) {
          matchedDistinctiveTokens += 1;
        }
      });

      if (matchedDistinctiveTokens < minimumDistinctiveTokens) {
        return false;
      }
    }

    return true;
  });
}

function createRunner(options, data, harness) {
  const outputDir = path.join(REPORTS_DIR, options.label);
  ensureDir(outputDir);

  const casesPath = path.join(outputDir, 'cases.jsonl');
  const summaryJsonPath = path.join(outputDir, 'summary.json');
  const summaryMarkdownPath = path.join(outputDir, 'summary.md');
  const casesStream = fs.createWriteStream(casesPath, { encoding: 'utf8' });

  const summary = {
    label: options.label,
    generatedAt: new Date().toISOString(),
    options: {
      deputeId: options.deputeId || null,
      limitDeputies: options.limitDeputies || null,
      comparePath: options.comparePath || null,
      runtimePath: options.runtimePath || path.relative(ROOT_DIR, RUNTIME_PATH)
    },
    totals: {
      cases: 0,
      passed: 0,
      failed: 0,
      failureRate: 0
    },
    categories: {},
    patterns: {},
    coverage: {
      documentTypesCovered: [],
      documentTypesMissing: []
    },
    examples: {
      failed: []
    }
  };

  return {
    async run() {
      const coverageState = {
        documentTypes: new Set()
      };

      const targetedDeputes = selectTargetedDeputes(data.deputes, options);
      const supplementalCases = buildSupplementalDocumentCases(targetedDeputes);

      for (const [deputeIndex, depute] of targetedDeputes.entries()) {
        const votes = loadDeputyVotes(depute.id);
        const context = buildDeputyContext(depute, votes, data.searchIndexEntries);
        const cases = buildCasesForDeputy(context, data);

        for (const testCase of cases) {
          await runTestCase(testCase, context, harness, summary, casesStream, coverageState);
        }

        if ((deputeIndex + 1) % 50 === 0) {
          console.log(`... ${deputeIndex + 1}/${targetedDeputes.length} deputes traites`);
        }
      }

      for (const testCase of supplementalCases) {
        const votes = loadDeputyVotes(testCase.depute.id);
        const context = buildDeputyContext(testCase.depute, votes, data.searchIndexEntries);
        await runTestCase(testCase.case, context, harness, summary, casesStream, coverageState);
      }

      casesStream.end();
      finalizeSummary(summary, coverageState, options);
      writeJson(summaryJsonPath, summary);
      writeFile(summaryMarkdownPath, buildMarkdownSummary(summary));
      console.log(`Regression terminee: ${summary.totals.cases} cas, ${summary.totals.failed} echecs.`);
      console.log(`Rapports: ${path.relative(ROOT_DIR, summaryJsonPath)} et ${path.relative(ROOT_DIR, summaryMarkdownPath)}`);
    }
  };
}

function selectTargetedDeputes(deputes, options) {
  let targetedDeputes = Array.isArray(deputes) ? [...deputes] : [];

  if (options.deputeId) {
    targetedDeputes = targetedDeputes.filter(depute => depute.id === options.deputeId);
  }

  if (options.limitDeputies) {
    targetedDeputes = targetedDeputes.slice(0, options.limitDeputies);
  }

  return targetedDeputes;
}

function loadDeputyVotes(deputeId) {
  const votesPath = path.join(VOTES_DIR, `${deputeId}.json`);
  if (!fs.existsSync(votesPath)) {
    return [];
  }

  const votes = loadJson(votesPath);
  return Array.isArray(votes) ? votes : [];
}

function buildDeputyContext(depute, votes, searchIndexEntries) {
  const voteIds = new Set();
  const searchEntriesById = new Map(searchIndexEntries.map(entry => [String(entry.numero), entry]));
  const votesWithMetadata = sortVotesByDate(
    votes.map(vote => {
      const voteId = getVoteId(vote);
      const metadata = searchEntriesById.get(String(voteId)) || null;
      voteIds.add(voteId);
      return {
        ...vote,
        __voteId: voteId,
        __metadata: metadata,
        __normalizedTitle: normalizeText(vote.titre || ''),
        __exactQuery: extractExactQueryFromTitle(vote.titre || ''),
        __exactType: detectDocumentType(extractExactQueryFromTitle(vote.titre || '') || vote.titre || '', EXACT_DOCUMENT_TYPE_PATTERNS),
        __familyQuery: extractDocumentFamilyQuery(vote.titre || ''),
        __familyType: detectDocumentType(extractDocumentFamilyQuery(vote.titre || '') || vote.titre || '', DOCUMENT_TYPE_PATTERNS)
      };
    }),
    'date_desc'
  );

  const byDate = new Map();
  const byMonth = new Map();
  const byYear = new Map();
  const familyGroups = new Map();
  const directThemeGroups = new Map();
  const keywordThemeGroups = new Map();

  votesWithMetadata.forEach(vote => {
    pushMapArray(byDate, vote.date, vote);
    pushMapArray(byMonth, vote.date ? vote.date.slice(0, 7) : '', vote);
    pushMapArray(byYear, vote.date ? vote.date.slice(0, 4) : '', vote);

    if (vote.__familyQuery) {
      pushMapArray(familyGroups, normalizeText(vote.__familyQuery), vote);
    }

    const rawCategory = vote.__metadata?.category || '';
    const normalizedCategory = normalizeText(rawCategory);
    const theme = CATEGORY_TO_THEME[rawCategory] || CATEGORY_TO_THEME[normalizedCategory] || null;
    if (theme) {
      pushMapArray(directThemeGroups, theme, vote);
    }

    const themeSearchText = normalizeText([
      vote.titre || '',
      vote.__metadata?.summary || '',
      vote.__metadata?.titre || ''
    ].join(' '));

    KEYWORD_THEME_CASES.forEach(themeCase => {
      if (themeCase.keywords.some(keyword => themeSearchText.includes(normalizeText(keyword)))) {
        pushMapArray(keywordThemeGroups, themeCase.theme, vote);
      }
    });
  });

  return {
    depute,
    votes: votesWithMetadata,
    voteIds,
    byDate,
    byMonth,
    byYear,
    familyGroups,
    directThemeGroups,
    keywordThemeGroups,
    searchIndexEntries
  };
}

function buildCasesForDeputy(context) {
  const cases = [];
  const { votes } = context;

  if (!votes.length) {
    return cases;
  }

  const exactDateCandidate = findExactDateCandidate(context);
  if (exactDateCandidate) {
    cases.push(buildClosedDateCase(context, exactDateCandidate.date, 'closed_date_fr', 'fr'));
    cases.push(buildClosedDateCase(context, exactDateCandidate.date, 'closed_date_numeric', 'numeric'));
    cases.push(buildOpenDateCase(context, exactDateCandidate.date));
    cases.push(buildScopeActionClearDateThread(context, exactDateCandidate.date));
  }

  const monthCandidate = findMonthCandidate(context);
  if (monthCandidate) {
    cases.push(buildClosedMonthYearCase(context, monthCandidate.month));
  }

  const specificVoteCandidate = findSpecificVoteCandidate(context);
  if (specificVoteCandidate) {
    cases.push(buildSpecificVoteCase(context, specificVoteCandidate, true));
    cases.push(buildSpecificVoteCase(context, specificVoteCandidate, false));
  }

  const largeListCase = buildLargeListCase(context);
  if (largeListCase) {
    cases.push(largeListCase);
  }

  const boundedListCase = buildBoundedListCase(context);
  if (boundedListCase) {
    cases.push(boundedListCase);
    cases.push(buildPaginationMetadataCase(context, boundedListCase));
  }

  const themeCandidate = findThemeCandidate(context);
  if (themeCandidate) {
    cases.push(buildThemeListCase(context, themeCandidate));
    cases.push(buildClosedThemeCase(context, themeCandidate));
    cases.push(buildThemeAnalysisCase(context, themeCandidate));
    const deputyResetCase = buildExplicitDeputyResetThread(context, themeCandidate);
    if (deputyResetCase) {
      cases.push(deputyResetCase);
    }
    cases.push(buildScopeActionClearThemeThread(context, themeCandidate));
  }

  const absentLocalCandidate = findAbsentLocalCandidate(context);
  if (absentLocalCandidate) {
    cases.push(buildAbsentLocalCase(context, absentLocalCandidate));
    cases.push(buildAbsentGlobalCase(context, absentLocalCandidate));
  }

  const recentFollowUpCandidate = findRecentFollowUpCandidate(context);
  if (recentFollowUpCandidate) {
    cases.push(buildRecentReferenceThread(context, recentFollowUpCandidate, 'les derniers'));
    cases.push(buildRecentReferenceThread(context, recentFollowUpCandidate, 'plus recents'));
    cases.push(buildRecentReferenceThread(context, recentFollowUpCandidate, '5 derniers votes'));
  }

  const mixedRecentCandidate = findMixedRecentCandidate(context);
  if (mixedRecentCandidate) {
    cases.push(buildShortVoteFollowUpThread(context, mixedRecentCandidate, 'Contre'));
    cases.push(buildShortVoteFollowUpThread(context, mixedRecentCandidate, 'Pour'));
  }

  const monthFollowUpCandidate = findMonthFollowUpCandidate(context);
  if (monthFollowUpCandidate) {
    cases.push(buildMonthFollowUpThread(context, monthFollowUpCandidate));
  }

  const dayFollowUpCandidate = findDayFollowUpCandidate(context);
  if (dayFollowUpCandidate) {
    cases.push(buildDayFollowUpThread(context, dayFollowUpCandidate));
  }

  return cases;
}

function buildSupplementalDocumentCases(deputes) {
  const supportedTypes = new Set(SUPPLEMENTAL_DOCUMENT_TYPES);
  const discovered = new Set();
  const supplementalCases = [];

  for (const depute of deputes) {
    const votes = loadDeputyVotes(depute.id);
    const supportedVotes = sortVotesByDate(votes.map(vote => ({
      ...vote,
      exactQuery: extractExactQueryFromTitle(vote.titre || ''),
      exactType: detectDocumentType(extractExactQueryFromTitle(vote.titre || '') || vote.titre || '', EXACT_DOCUMENT_TYPE_PATTERNS)
    })), 'date_desc');

    for (const vote of supportedVotes) {
      const normalizedType = normalizeSupplementalType(vote.exactType);
      if (!supportedTypes.has(normalizedType) || discovered.has(normalizedType) || !vote.exactQuery) {
        continue;
      }

      supplementalCases.push({
        depute,
        case: {
          id: `document_target_${normalizedType}__${depute.id}`,
          category: 'document_target',
          meta: {
            documentType: normalizedType
          },
          steps: [
            {
              question: `montre les votes sur ${vote.exactQuery}`,
              expected: {
                routeAction: 'deterministic',
                intentKind: 'list',
                filters: {
                  queryText: vote.exactQuery,
                  sort: 'date_desc'
                },
                filtersAbsent: ['dateFrom', 'dateTo'],
                resultKind: 'response',
                displayedVoteIdsInclude: [getVoteId(vote)],
                voteIdsInclude: [getVoteId(vote)]
              }
            }
          ]
        }
      });

      discovered.add(normalizedType);
      if (discovered.size === supportedTypes.size) {
        return supplementalCases;
      }
    }
  }

  if (!discovered.has('loi')) {
    for (const depute of deputes) {
      const votes = loadDeputyVotes(depute.id);
      const vote = votes.find(entry => extractLawReferenceQuery(entry.titre || ''));
      if (!vote) {
        continue;
      }

      supplementalCases.push(
        buildSupplementalDerivedCase('loi', depute, vote, extractLawReferenceQuery(vote.titre || ''))
      );
      discovered.add('loi');
      break;
    }
  }

  if (!discovered.has('traite')) {
    for (const depute of deputes) {
      const votes = loadDeputyVotes(depute.id);
      const exactQueryVote = votes.find(entry => {
        const title = String(entry.titre || '');
        return (/\baccord\b|\btrait[ée]\b/iu.test(title)) && extractExactQueryFromTitle(title);
      });
      const vote = exactQueryVote
        || votes.find(entry => extractTreatyReferenceQuery(entry.titre || ''));
      if (!vote) {
        continue;
      }

      const queryText = exactQueryVote
        ? extractExactQueryFromTitle(vote.titre || '')
        : extractTreatyReferenceQuery(vote.titre || '');

      supplementalCases.push(
        buildSupplementalDerivedCase('traite', depute, vote, queryText)
      );
      discovered.add('traite');
      break;
    }
  }

  return supplementalCases;
}

function findExactDateCandidate(context) {
  const vote = context.votes.find(entry => entry.date);
  return vote ? { date: vote.date } : null;
}

function findMonthCandidate(context) {
  const months = [...context.byMonth.keys()].filter(Boolean).sort().reverse();
  return months.length > 0 ? { month: months[0] } : null;
}

function findSpecificVoteCandidate(context) {
  const preferredTypes = new Set(['amendement', 'motion', 'declaration', 'resolution', 'traite', 'article', 'loi']);

  for (const vote of context.votes) {
    if (!vote.__exactQuery || !['Pour', 'Contre', 'Abstention'].includes(vote.vote)) {
      continue;
    }

    if (containsStandaloneYear(vote.__exactQuery)) {
      continue;
    }

    const normalizedType = normalizeSupplementalType(vote.__exactType);
    if (normalizedType && !preferredTypes.has(normalizedType)) {
      continue;
    }

    const oracleMatches = filterOracleVotesByQuery(context.votes, vote.__exactQuery);
    if (oracleMatches.length === 1 && getVoteId(oracleMatches[0]) === getVoteId(vote)) {
      return vote;
    }
  }

  return null;
}

function findThemeCandidate(context) {
  for (const themeCase of KEYWORD_THEME_CASES) {
    const votes = context.keywordThemeGroups.get(themeCase.theme) || [];
    if (votes.length > 0) {
      return {
        theme: themeCase.theme,
        votes,
        questionTheme: themeCase.questionTheme
      };
    }
  }

  for (const [theme, votes] of context.directThemeGroups.entries()) {
    if (votes.length > 0) {
      return {
        theme,
        votes,
        questionTheme: theme === 'budget'
          ? 'le budget'
          : theme === 'outre-mer'
            ? 'l outre-mer'
            : theme === 'emploi'
              ? 'l emploi'
              : theme === 'ecologie'
                ? 'l ecologie'
                : `la ${theme}`
      };
    }
  }

  return null;
}

function findAbsentLocalCandidate(context) {
  const findCandidate = predicate => context.searchIndexEntries.find(entry => {
    if (!entry?.exactQuery || context.voteIds.has(String(entry.numero))) {
      return false;
    }

    if (predicate && !predicate(entry)) {
      return false;
    }

    const absentQueryText = buildAbsentQueryText(entry.exactQuery, entry.exactType || entry.familyType);
    return Boolean(absentQueryText);
  });

  const selectedEntry = findCandidate(entry => !containsStandaloneYear(entry.exactQuery))
    || findCandidate(() => true);

  if (!selectedEntry) {
    return null;
  }

  return {
    numero: selectedEntry.numero,
    queryText: selectedEntry.exactQuery,
    absentQueryText: buildAbsentQueryText(selectedEntry.exactQuery, selectedEntry.exactType || selectedEntry.familyType),
    exactType: selectedEntry.exactType || selectedEntry.familyType
  };
}

function findRecentFollowUpCandidate(context) {
  for (const [queryKey, votes] of context.familyGroups.entries()) {
    const firstVote = votes[0];
    if (!firstVote || !firstVote.__familyQuery) {
      continue;
    }

    const oracleVotes = sortVotesByDate(
      filterOracleVotesByQuery(context.votes, firstVote.__familyQuery),
      'date_desc'
    );

    if (oracleVotes.length < 13) {
      continue;
    }

    return {
      queryKey,
      queryText: firstVote.__familyQuery,
      groupVotes: oracleVotes
    };
  }

  return null;
}

function findMixedRecentCandidate(context) {
  const initialVotes = context.votes.slice(0, 5);
  const uniqueVoteKinds = new Set(initialVotes.map(vote => vote.vote));
  if (initialVotes.length === 5 && uniqueVoteKinds.has('Pour') && uniqueVoteKinds.has('Contre')) {
    return {
      initialVotes
    };
  }
  return null;
}

function findMonthFollowUpCandidate(context) {
  for (const [queryKey, votes] of context.familyGroups.entries()) {
    const groupedByYear = new Map();
    votes.forEach(vote => {
      if (vote.date) {
        pushMapArray(groupedByYear, vote.date.slice(0, 4), vote);
      }
    });

    for (const [year, yearVotes] of groupedByYear.entries()) {
      const monthGroups = new Map();
      yearVotes.forEach(vote => {
        pushMapArray(monthGroups, vote.date.slice(0, 7), vote);
      });
      if (monthGroups.size < 2 || yearVotes.length > 12) {
        continue;
      }

      const sortedMonths = [...monthGroups.keys()].sort();
      const targetMonth = sortedMonths[sortedMonths.length - 1];
      const targetVotes = sortVotesByDate(monthGroups.get(targetMonth) || [], 'date_desc');
      const sampleVote = yearVotes[0];
      if (!sampleVote?.__familyQuery) {
        continue;
      }

      return {
        queryKey,
        queryText: sampleVote.__familyQuery,
        year,
        baseVotes: sortVotesByDate(yearVotes, 'date_desc'),
        monthRange: monthToRange(targetMonth),
        monthVotes: targetVotes,
        monthName: formatMonthName(targetMonth)
      };
    }
  }

  return null;
}

function findDayFollowUpCandidate(context) {
  for (const [queryKey, votes] of context.familyGroups.entries()) {
    const groupedByMonth = new Map();
    votes.forEach(vote => {
      if (vote.date) {
        pushMapArray(groupedByMonth, vote.date.slice(0, 7), vote);
      }
    });

    for (const [month, monthVotes] of groupedByMonth.entries()) {
      if (monthVotes.length > 12) {
        continue;
      }

      const groupedByDate = new Map();
      monthVotes.forEach(vote => {
        pushMapArray(groupedByDate, vote.date, vote);
      });
      const targetDate = [...groupedByDate.keys()].sort().reverse()[0];
      const sampleVote = monthVotes[0];
      if (!targetDate || !sampleVote?.__familyQuery) {
        continue;
      }

      return {
        queryKey,
        queryText: sampleVote.__familyQuery,
        month,
        monthRange: monthToRange(month),
        baseVotes: sortVotesByDate(monthVotes, 'date_desc'),
        targetDate,
        dayVotes: sortVotesByDate(groupedByDate.get(targetDate) || [], 'date_desc'),
        followUpDayText: formatFrenchDateWithoutYear(targetDate)
      };
    }
  }

  return null;
}

function buildClosedDateCase(context, date, category, formatKind) {
  const votesOnDate = sortVotesByDate(context.byDate.get(date) || [], 'date_desc');
  const question = formatKind === 'numeric'
    ? `est-ce que ce depute a vote le ${formatNumericDate(date)} ?`
    : `est-ce que ce depute a vote le ${formatFrenchDate(date)} ?`;

  return {
    id: `${category}__${context.depute.id}__${date}`,
    category,
    steps: [
      {
        question,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            dateFrom: date,
            dateTo: date,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Oui',
          displayedVoteIdsExact: votesOnDate.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votesOnDate.map(getVoteId),
          messageIncludes: [formatHumanDateDescription(date, date)]
        }
      }
    ]
  };
}

function buildClosedMonthYearCase(context, month) {
  const votesInMonth = sortVotesByDate(context.byMonth.get(month) || [], 'date_desc');
  const range = monthToRange(month);
  return {
    id: `closed_month_year__${context.depute.id}__${month}`,
    category: 'closed_date_month_year',
    steps: [
      {
        question: `est-ce que ce depute a vote en ${formatMonthYearText(month)} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Oui',
          displayedVoteIdsExact: votesInMonth.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votesInMonth.map(getVoteId),
          messageIncludes: [`en ${formatMonthYearText(month)}`]
        }
      }
    ]
  };
}

function buildOpenDateCase(context, date) {
  const votesOnDate = sortVotesByDate(context.byDate.get(date) || [], 'date_desc');
  return {
    id: `open_date__${context.depute.id}__${date}`,
    category: 'open_date_exact',
    steps: [
      {
        question: `qu'est-ce que cet elu a vote le ${formatFrenchDate(date)} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            dateFrom: date,
            dateTo: date,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: votesOnDate.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votesOnDate.map(getVoteId),
          messageIncludes: [formatHumanDateDescription(date, date)]
        }
      }
    ]
  };
}

function buildSpecificVoteCase(context, candidate, isPositive) {
  const expectedVote = candidate;
  const expectedVoteLabel = isPositive ? expectedVote.vote : inverseVote(expectedVote.vote);
  const queryText = expectedVote.__exactQuery;
  const matchingVotes = filterOracleVotesByQuery(context.votes, queryText);
  const matchingSenseVotes = matchingVotes.filter(vote => vote.vote === expectedVoteLabel);
  const yesNo = matchingSenseVotes.length > 0 ? 'Oui' : 'Non';

  return {
    id: `${isPositive ? 'closed_vote_positive' : 'closed_vote_negative'}__${context.depute.id}__${expectedVote.__voteId}`,
    category: isPositive ? 'closed_vote_positive' : 'closed_vote_negative',
    meta: {
      documentType: normalizeSupplementalType(expectedVote.__exactType)
    },
    steps: [
      {
        question: buildClosedVoteQuestion(queryText, expectedVoteLabel),
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText,
            vote: expectedVoteLabel,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo,
          displayedVoteIdsExact: matchingSenseVotes.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: matchingSenseVotes.map(getVoteId),
          messageIncludes: matchingSenseVotes.length > 0 ? [] : ['mais pas avec ce sens de vote']
        }
      }
    ]
  };
}

function buildLargeListCase(context) {
  if (context.votes.length <= LARGE_RESULT_THRESHOLD) {
    return null;
  }

  const displayedVotes = context.votes.slice(0, DEFAULT_RECENT_LIMIT);
  return {
    id: `large_list__${context.depute.id}`,
    category: 'large_list_paginated',
    steps: [
      {
        question: 'liste les votes de ce depute',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: displayedVotes.map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId),
          messageIncludes: ['20 derniers']
        }
      }
    ]
  };
}

function buildBoundedListCase(context) {
  const displayedVotes = context.votes.slice(0, 5);
  if (displayedVotes.length < 5) {
    return null;
  }

  return {
    id: `bounded_list__${context.depute.id}`,
    category: 'bounded_list_deterministic',
    steps: [
      {
        question: '5 derniers votes',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            limit: 5,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: displayedVotes.map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildPaginationMetadataCase(context, boundedListCase) {
  const displayedVotes = context.votes.slice(0, 5);
  return {
    id: `ui_pagination_metadata__${context.depute.id}`,
    category: 'ui_pagination_metadata',
    steps: [
      {
        question: boundedListCase.steps[0].question,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          resultKind: 'response',
          displayedVoteIdsExact: displayedVotes.map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId),
          sessionLastScopeSource: 'explicit_filter',
          metadataPageSize: 5,
          metadataDisplayedVoteIdsExact: displayedVotes.map(getVoteId),
          metadataAllVoteIdsExact: context.votes.map(getVoteId),
          metadataReferenceVoteIdsInclude: displayedVotes.map(getVoteId),
          metadataReferenceSourceUrlPrefix: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/'
        }
      }
    ]
  };
}

function buildThemeListCase(context, candidate) {
  const votes = sortVotesByDate(candidate.votes, 'date_desc');
  return {
    id: `theme_list__${context.depute.id}__${candidate.theme}`,
    category: 'theme_filter',
    steps: [
      {
        question: `montre les votes sur ${candidate.questionTheme}`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            theme: candidate.theme,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: votes.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildScopeActionClearThemeThread(context, candidate) {
  const themeVotes = sortVotesByDate(candidate.votes, 'date_desc');
  return {
    id: `ui_scope_clear_theme__${context.depute.id}__${candidate.theme}`,
    category: 'ui_scope_action',
    steps: [
      {
        question: `montre les votes sur ${candidate.questionTheme}`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          resultKind: 'response',
          sessionLastScopeSource: 'explicit_filter',
          displayedVoteIdsExact: themeVotes.slice(0, DEFAULT_RECENT_LIMIT).map(getVoteId),
          voteIdsExact: themeVotes.map(getVoteId)
        }
      },
      {
        scopeAction: 'clear_theme',
        question: 'Retirer le thème',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'depute_all',
          filters: {
            limit: DEFAULT_RECENT_LIMIT,
            sort: 'date_desc'
          },
          filtersAbsent: ['theme', 'vote', 'queryText', 'dateFrom', 'dateTo'],
          resultKind: 'response',
          sessionLastScopeSource: 'depute_all',
          displayedVoteIdsExact: context.votes.slice(0, DEFAULT_RECENT_LIMIT).map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildScopeActionClearDateThread(context, date) {
  const votesOnDate = sortVotesByDate(context.byDate.get(date) || [], 'date_desc');
  return {
    id: `ui_scope_clear_date__${context.depute.id}__${date}`,
    category: 'ui_scope_action',
    steps: [
      {
        question: `qu'est-ce que cet elu a vote le ${formatFrenchDate(date)} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          resultKind: 'response',
          sessionLastScopeSource: 'explicit_filter',
          displayedVoteIdsExact: votesOnDate.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votesOnDate.map(getVoteId)
        }
      },
      {
        scopeAction: 'clear_date',
        question: 'Retirer la période',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'depute_all',
          filters: {
            limit: DEFAULT_RECENT_LIMIT,
            sort: 'date_desc'
          },
          filtersAbsent: ['theme', 'vote', 'queryText', 'dateFrom', 'dateTo'],
          resultKind: 'response',
          sessionLastScopeSource: 'depute_all',
          displayedVoteIdsExact: context.votes.slice(0, DEFAULT_RECENT_LIMIT).map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildClosedThemeCase(context, candidate) {
  const votes = sortVotesByDate(candidate.votes, 'date_desc');
  return {
    id: `theme_closed__${context.depute.id}__${candidate.theme}`,
    category: 'theme_closed_question',
    steps: [
      {
        question: `est-ce que ce depute a vote sur ${candidate.questionTheme} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            theme: candidate.theme,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Oui',
          displayedVoteIdsExact: votes.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildThemeAnalysisCase(context, candidate) {
  return {
    id: `theme_analysis__${context.depute.id}__${candidate.theme}`,
    category: 'analysis_theme',
    steps: [
      {
        question: `quelle est sa position sur ${candidate.questionTheme} ?`,
        expected: {
          routeAction: 'analysis_rag',
          intentKind: 'analysis',
          filters: {
            theme: candidate.theme,
            sort: 'date_desc'
          },
          resultKind: 'analysis_rag'
        }
      }
    ]
  };
}

function buildExplicitDeputyResetThread(context, candidate) {
  const recentVotes = context.votes.slice(0, 5);
  const recentContreVotes = context.votes.filter(vote => vote.vote === 'Contre').slice(0, 10);
  const candidateVotes = sortVotesByDate(candidate.votes, 'date_desc');

  if (recentVotes.length < 5 || recentContreVotes.length < 10 || candidateVotes.length === 0) {
    return null;
  }

  return {
    id: `explicit_depute_reset__${context.depute.id}__${normalizeText(candidate.theme).replace(/\s+/g, '_')}`,
    category: 'explicit_depute_reset',
    steps: [
      {
        question: `est-ce que ce depute a vote sur ${candidate.questionTheme} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            theme: candidate.theme,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Oui',
          displayedVoteIdsExact: candidateVotes.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: candidateVotes.map(getVoteId)
        }
      },
      {
        question: 'montre les 10 derniers votes contre de ce depute',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'explicit_filter',
          filters: {
            vote: 'Contre',
            limit: 10,
            sort: 'date_desc'
          },
          filtersAbsent: ['theme', 'queryText', 'dateFrom', 'dateTo'],
          resultKind: 'response',
          displayedVoteIdsExact: recentContreVotes.map(getVoteId),
          voteIdsExact: context.votes.filter(vote => vote.vote === 'Contre').map(getVoteId)
        }
      },
      {
        question: 'Quels sont les themes principaux dans ces votes ?',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'subjects',
          source: 'last_result',
          scopeVoteIdsExact: recentContreVotes.map(getVoteId),
          resultKind: 'response',
          displayedVoteIdsExact: recentContreVotes.map(getVoteId),
          voteIdsExact: recentContreVotes.map(getVoteId),
          messageIncludes: ['Themes principaux']
        }
      },
      {
        question: 'Liste les 5 derniers votes de ce depute.',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'explicit_filter',
          filters: {
            limit: 5,
            sort: 'date_desc'
          },
          filtersAbsent: ['theme', 'vote', 'queryText', 'dateFrom', 'dateTo'],
          resultKind: 'response',
          displayedVoteIdsExact: recentVotes.map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId)
        }
      }
    ]
  };
}

function buildAbsentLocalCase(context, candidate) {
  return {
    id: `absent_local__${context.depute.id}__${candidate.numero}`,
    category: 'scrutin_exists_without_local_vote',
    meta: {
      documentType: normalizeSupplementalType(candidate.exactType)
    },
    steps: [
      {
        question: `est-ce que ce depute a vote sur ${candidate.queryText} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText: candidate.queryText,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Non',
          displayedVoteIdsExact: [],
          voteIdsExact: [],
          messageIncludes: ['dans la base de cette legislature']
        }
      }
    ]
  };
}

function buildAbsentGlobalCase(context, candidate) {
  return {
    id: `absent_global__${context.depute.id}__${candidate.numero}`,
    category: 'scrutin_missing_globally',
    steps: [
      {
        question: `est-ce que ce depute a vote sur ${candidate.absentQueryText} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText: candidate.absentQueryText,
            sort: 'date_desc'
          },
          resultKind: 'response',
          yesNo: 'Non',
          displayedVoteIdsExact: [],
          voteIdsExact: [],
          messageExcludes: ['dans la base de cette legislature']
        }
      }
    ]
  };
}

function buildRecentReferenceThread(context, candidate, followUpQuestion) {
  const baseDisplayed = candidate.groupVotes.slice(0, DEFAULT_RECENT_LIMIT);
  const followUpDisplayed = followUpQuestion === '5 derniers votes'
    ? baseDisplayed.slice(0, 5)
    : baseDisplayed;

  return {
    id: `recent_reference__${sanitizeId(followUpQuestion)}__${context.depute.id}__${candidate.queryKey}`,
    category: 'follow_up_recent',
    steps: [
      {
        question: `montre les votes sur ${candidate.queryText}`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText: candidate.queryText,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: baseDisplayed.map(getVoteId)
        }
      },
      {
        question: followUpQuestion,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'last_result',
          scopeVoteIdsExact: baseDisplayed.map(getVoteId),
          filters: {
            sort: 'date_desc',
            ...(followUpQuestion === '5 derniers votes' ? { limit: 5 } : { limit: DEFAULT_RECENT_LIMIT })
          },
          resultKind: 'response',
          displayedVoteIdsExact: followUpDisplayed.map(getVoteId),
          voteIdsExact: baseDisplayed.map(getVoteId)
        }
      }
    ]
  };
}

function buildShortVoteFollowUpThread(context, candidate, followUpVote) {
  const initialVotes = candidate.initialVotes;
  const filteredVotes = initialVotes.filter(vote => vote.vote === followUpVote);

  return {
    id: `short_follow_up_${normalizeText(followUpVote)}__${context.depute.id}`,
    category: 'follow_up_short_vote',
    steps: [
      {
        question: '5 derniers votes',
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            limit: 5,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: initialVotes.map(getVoteId),
          voteIdsExact: context.votes.map(getVoteId)
        }
      },
      {
        question: `et ${normalizeText(followUpVote)} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'last_result',
          scopeVoteIdsExact: initialVotes.map(getVoteId),
          filters: {
            vote: followUpVote,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: filteredVotes.map(getVoteId).slice(0, DEFAULT_RECENT_LIMIT),
          voteIdsExact: filteredVotes.map(getVoteId),
          messageIncludes: filteredVotes.length === 0 ? ['Je ne trouve aucun vote correspondant'] : []
        }
      }
    ]
  };
}

function buildMonthFollowUpThread(context, candidate) {
  return {
    id: `month_follow_up__${context.depute.id}__${candidate.queryKey}`,
    category: 'follow_up_month',
    steps: [
      {
        question: `montre les votes sur ${candidate.queryText} en ${candidate.year}`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText: candidate.queryText,
            dateFrom: `${candidate.year}-01-01`,
            dateTo: `${candidate.year}-12-31`,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: candidate.baseVotes.map(getVoteId),
          voteIdsExact: candidate.baseVotes.map(getVoteId)
        }
      },
      {
        question: `et en ${candidate.monthName} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'last_result',
          scopeVoteIdsExact: candidate.baseVotes.map(getVoteId),
          filters: {
            dateFrom: candidate.monthRange.dateFrom,
            dateTo: candidate.monthRange.dateTo,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: candidate.monthVotes.map(getVoteId),
          voteIdsExact: candidate.monthVotes.map(getVoteId)
        }
      }
    ]
  };
}

function buildDayFollowUpThread(context, candidate) {
  return {
    id: `day_follow_up__${context.depute.id}__${candidate.queryKey}`,
    category: 'follow_up_day',
    steps: [
      {
        question: `montre les votes sur ${candidate.queryText} en ${formatMonthYearText(candidate.month)}`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          filters: {
            queryText: candidate.queryText,
            dateFrom: candidate.monthRange.dateFrom,
            dateTo: candidate.monthRange.dateTo,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: candidate.baseVotes.map(getVoteId),
          voteIdsExact: candidate.baseVotes.map(getVoteId)
        }
      },
      {
        question: `et le ${candidate.followUpDayText} ?`,
        expected: {
          routeAction: 'deterministic',
          intentKind: 'list',
          source: 'last_result',
          scopeVoteIdsExact: candidate.baseVotes.map(getVoteId),
          filters: {
            dateFrom: candidate.targetDate,
            dateTo: candidate.targetDate,
            sort: 'date_desc'
          },
          resultKind: 'response',
          displayedVoteIdsExact: candidate.dayVotes.map(getVoteId),
          voteIdsExact: candidate.dayVotes.map(getVoteId)
        }
      }
    ]
  };
}

async function runTestCase(testCase, context, harness, summary, casesStream, coverageState) {
  const session = createSession(context.depute.id);
  const threadId = `${testCase.id}::${context.depute.id}`;

  for (const [stepIndex, step] of testCase.steps.entries()) {
    const actual = await executeStep(harness, step, session, context.depute, context.votes);
    const evaluation = evaluateStep(step.expected, actual);
    const record = {
      id: testCase.id,
      category: testCase.category,
      deputeId: context.depute.id,
      threadId,
      stepIndex,
      question: step.question,
      meta: {
        documentType: testCase.meta?.documentType || null
      },
      expected: sanitizeForReport(step.expected),
      actual: sanitizeForReport(actual),
      status: evaluation.status,
      failureCodes: evaluation.failureCodes,
      failureDetails: evaluation.failureDetails,
      patternKey: evaluation.patternKey
    };

    casesStream.write(`${JSON.stringify(record)}\n`);
    updateSummary(summary, record);

    if (testCase.meta?.documentType) {
      coverageState.documentTypes.add(testCase.meta.documentType);
    }
  }
}

async function executeStep(harness, step, session, depute, deputeVotes) {
  const question = step.question;
  harness.__setCurrentDepute({ ...depute, votes: deputeVotes });
  harness.__applyChatSessionState(session);

  let route = null;
  let result = null;
  let metadata = null;

  if (step.scopeAction) {
    route = harness.buildScopeActionRoute(step.scopeAction);
    result = harness.executeDeterministicRoute(route, '', { ...depute, votes: deputeVotes });
    if (result.kind === 'response') {
      harness.updateSessionFromResult(session, {
        ...result,
        query: question
      });
      harness.__applyChatSessionState(session);
      metadata = harness.buildDeterministicMessageMetadata(result, route.intent.kind);
    }
  } else {
    route = harness.routeQuestion(question, session);
  }

  if (route.action === 'deterministic' && !result) {
    result = harness.executeDeterministicRoute(route, question, { ...depute, votes: deputeVotes });
    if (result.kind === 'response') {
      harness.updateSessionFromResult(session, {
        ...result,
        query: question
      });
      harness.__applyChatSessionState(session);
      metadata = harness.buildDeterministicMessageMetadata(result, route.intent.kind);
    }
  } else if (route.action === 'analysis_rag') {
    const contextVotes = await harness.buildAnalysisContextVotes(route, question, deputeVotes);
    const contextVoteIds = contextVotes.map(vote => harness.getVoteId(vote));
    if (contextVoteIds.length > 0) {
      harness.updateSessionFromResult(session, {
        voteIds: contextVoteIds,
        query: question,
        filters: route.scope.filters,
        sort: route.scope.filters.sort,
        limit: contextVoteIds.length
      });
    }

    result = {
      kind: 'analysis_rag',
      contextVoteIds
    };
  } else if (!result) {
    result = {
      kind: 'clarify',
      message: route.message
    };
  }

  return {
    route,
    result,
    metadata,
    session: cloneData(session)
  };
}

function evaluateStep(expected, actual) {
  const failures = [];
  const route = actual.route || {};
  const intent = route.intent || {};
  const scope = route.scope || {};
  const result = actual.result || {};

  if (expected.routeAction && route.action !== expected.routeAction) {
    failures.push({
      code: 'action_mismatch',
      detail: `action:${expected.routeAction}->${route.action || 'null'}`
    });
  }

  if (expected.intentKind && intent.kind !== expected.intentKind) {
    failures.push({
      code: 'intent_mismatch',
      detail: `intent:${expected.intentKind}->${intent.kind || 'null'}`
    });
  }

  if (expected.source && scope.source !== expected.source) {
    failures.push({
      code: 'follow_up_scope_mismatch',
      detail: `source:${expected.source}->${scope.source || 'null'}`
    });
  }

  if (Object.prototype.hasOwnProperty.call(expected, 'scopeVoteIdsExact')) {
    const scopeVoteIds = Array.isArray(scope.voteIds) ? scope.voteIds.map(String) : [];
    const expectedVoteIds = Array.isArray(expected.scopeVoteIdsExact) ? expected.scopeVoteIdsExact.map(String) : [];
    const scopeMismatch = compareIdLists(expectedVoteIds, scopeVoteIds);
    if (scopeMismatch.missing.length || scopeMismatch.unexpected.length) {
      failures.push({
        code: 'follow_up_scope_mismatch',
        detail: `scope.voteIds:${expectedVoteIds.join(',')}!=${scopeVoteIds.join(',')}`
      });
    }
  }

  Object.entries(expected.filters || {}).forEach(([filterKey, filterValue]) => {
    const actualValue = scope?.filters?.[filterKey];
    const expectedValue = filterKey === 'queryText'
      ? normalizeText(filterValue)
      : filterValue;
    const normalizedActualValue = filterKey === 'queryText'
      ? normalizeText(actualValue)
      : actualValue;

    if (normalizedActualValue !== expectedValue) {
      failures.push({
        code: 'scope_mismatch',
        detail: `filter.${filterKey}:${String(expectedValue)}->${String(normalizedActualValue)}`
      });
    }
  });

  if (Array.isArray(expected.filtersAbsent)) {
    expected.filtersAbsent.forEach(filterKey => {
      const actualValue = scope?.filters?.[filterKey];
      if (actualValue !== null && actualValue !== undefined) {
        failures.push({
          code: 'scope_mismatch',
          detail: `filter.${filterKey}:expected_empty->${String(actualValue)}`
        });
      }
    });
  }

  if (expected.resultKind && result.kind !== expected.resultKind) {
    failures.push({
      code: 'result_kind_mismatch',
      detail: `result:${expected.resultKind}->${result.kind || 'null'}`
    });
  }

  if (expected.sessionLastScopeSource && actual.session?.lastScopeSource !== expected.sessionLastScopeSource) {
    failures.push({
      code: 'scope_mismatch',
      detail: `session.scope:${expected.sessionLastScopeSource}->${String(actual.session?.lastScopeSource || 'null')}`
    });
  }

  if (expected.yesNo) {
    const expectedPrefix = expected.yesNo === 'Oui' ? 'Oui.' : 'Non.';
    if (!String(result.message || '').startsWith(expectedPrefix)) {
      failures.push({
        code: 'polarity_mismatch',
        detail: `polarity:${expectedPrefix}`
      });
    }
  }

  if (Array.isArray(expected.messageIncludes)) {
    expected.messageIncludes.forEach(fragment => {
      if (!messageIncludesFragment(result.message || '', fragment)) {
        failures.push({
          code: 'reason_missing',
          detail: `message+:${fragment}`
        });
      }
    });
  }

  if (Array.isArray(expected.messageExcludes)) {
    expected.messageExcludes.forEach(fragment => {
      if (messageIncludesFragment(result.message || '', fragment)) {
        failures.push({
          code: 'reason_missing',
          detail: `message-:${fragment}`
        });
      }
    });
  }

  if (Array.isArray(expected.displayedVoteIdsExact)) {
    const actualDisplayed = Array.isArray(result.displayedVoteIds)
      ? result.displayedVoteIds.map(String)
      : [];
    const mismatch = compareIdLists(expected.displayedVoteIdsExact, actualDisplayed);
    if (mismatch.missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `displayed.missing:${mismatch.missing.join(',')}`
      });
    }
    if (mismatch.unexpected.length) {
      failures.push({
        code: 'unexpected_vote_ids',
        detail: `displayed.unexpected:${mismatch.unexpected.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.displayedVoteIdsInclude)) {
    const actualDisplayed = Array.isArray(result.displayedVoteIds)
      ? result.displayedVoteIds.map(String)
      : [];
    const missing = compareIncludedIds(expected.displayedVoteIdsInclude, actualDisplayed);
    if (missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `displayed.missing:${missing.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.voteIdsExact)) {
    const actualVoteIds = Array.isArray(result.voteIds)
      ? result.voteIds.map(String)
      : [];
    const mismatch = compareIdLists(expected.voteIdsExact, actualVoteIds);
    if (mismatch.missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `voteIds.missing:${mismatch.missing.join(',')}`
      });
    }
    if (mismatch.unexpected.length) {
      failures.push({
        code: 'unexpected_vote_ids',
        detail: `voteIds.unexpected:${mismatch.unexpected.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.voteIdsInclude)) {
    const actualVoteIds = Array.isArray(result.voteIds)
      ? result.voteIds.map(String)
      : [];
    const missing = compareIncludedIds(expected.voteIdsInclude, actualVoteIds);
    if (missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `voteIds.missing:${missing.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.contextVoteIdsExact)) {
    const actualContextVoteIds = Array.isArray(result.contextVoteIds)
      ? result.contextVoteIds.map(String)
      : [];
    const mismatch = compareIdLists(expected.contextVoteIdsExact, actualContextVoteIds);
    if (mismatch.missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `context.missing:${mismatch.missing.join(',')}`
      });
    }
    if (mismatch.unexpected.length) {
      failures.push({
        code: 'unexpected_vote_ids',
        detail: `context.unexpected:${mismatch.unexpected.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.contextVoteIdsInclude)) {
    const actualContextVoteIds = Array.isArray(result.contextVoteIds)
      ? result.contextVoteIds.map(String)
      : [];
    const missing = compareIncludedIds(expected.contextVoteIdsInclude, actualContextVoteIds);
    if (missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `context.missing:${missing.join(',')}`
      });
    }
  }

  const metadata = actual.metadata || {};

  if (Number.isFinite(expected.metadataPageSize) && metadata.pageSize !== expected.metadataPageSize) {
    failures.push({
      code: 'scope_mismatch',
      detail: `metadata.pageSize:${expected.metadataPageSize}->${String(metadata.pageSize || 'null')}`
    });
  }

  if (Array.isArray(expected.metadataDisplayedVoteIdsExact)) {
    const actualDisplayedVoteIds = Array.isArray(metadata.displayedVoteIds)
      ? metadata.displayedVoteIds.map(String)
      : [];
    const mismatch = compareIdLists(expected.metadataDisplayedVoteIdsExact, actualDisplayedVoteIds);
    if (mismatch.missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `metadata.displayed.missing:${mismatch.missing.join(',')}`
      });
    }
    if (mismatch.unexpected.length) {
      failures.push({
        code: 'unexpected_vote_ids',
        detail: `metadata.displayed.unexpected:${mismatch.unexpected.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.metadataAllVoteIdsExact)) {
    const actualAllVoteIds = Array.isArray(metadata.allVoteIds)
      ? metadata.allVoteIds.map(String)
      : [];
    const mismatch = compareIdLists(expected.metadataAllVoteIdsExact, actualAllVoteIds);
    if (mismatch.missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `metadata.all.missing:${mismatch.missing.join(',')}`
      });
    }
    if (mismatch.unexpected.length) {
      failures.push({
        code: 'unexpected_vote_ids',
        detail: `metadata.all.unexpected:${mismatch.unexpected.join(',')}`
      });
    }
  }

  if (Array.isArray(expected.metadataReferenceVoteIdsInclude)) {
    const actualReferenceVoteIds = Array.isArray(metadata.references)
      ? metadata.references.map(reference => String(reference.voteId || ''))
      : [];
    const missing = compareIncludedIds(expected.metadataReferenceVoteIdsInclude, actualReferenceVoteIds);
    if (missing.length) {
      failures.push({
        code: 'missing_vote_ids',
        detail: `metadata.references.missing:${missing.join(',')}`
      });
    }
  }

  if (expected.metadataReferenceSourceUrlPrefix) {
    const references = Array.isArray(metadata.references) ? metadata.references : [];
    const hasInvalidSource = references.length === 0 || references.some(reference => {
      const url = String(reference.sourceUrl || '');
      return !url.startsWith(expected.metadataReferenceSourceUrlPrefix);
    });

    if (hasInvalidSource) {
      failures.push({
        code: 'reason_missing',
        detail: `metadata.references.urlprefix:${expected.metadataReferenceSourceUrlPrefix}`
      });
    }
  }

  failures.sort((left, right) => FAILURE_PRIORITY.indexOf(left.code) - FAILURE_PRIORITY.indexOf(right.code));

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    failureCodes: failures.map(failure => failure.code),
    failureDetails: failures,
    patternKey: failures[0] ? failures[0].detail : 'passed'
  };
}

function updateSummary(summary, record) {
  summary.totals.cases += 1;
  if (record.status === 'passed') {
    summary.totals.passed += 1;
  } else {
    summary.totals.failed += 1;
  }

  const categoryStats = summary.categories[record.category] || {
    total: 0,
    failed: 0
  };
  categoryStats.total += 1;
  if (record.status === 'failed') {
    categoryStats.failed += 1;
  }
  summary.categories[record.category] = categoryStats;

  if (record.status === 'failed') {
    summary.patterns[record.patternKey] = (summary.patterns[record.patternKey] || 0) + 1;
    if (summary.examples.failed.length < 20) {
      summary.examples.failed.push({
        id: record.id,
        category: record.category,
        deputeId: record.deputeId,
        question: record.question,
        failureCodes: record.failureCodes,
        patternKey: record.patternKey,
        expected: record.expected,
        actual: record.actual
      });
    }
  }
}

function finalizeSummary(summary, coverageState, options) {
  summary.totals.failureRate = summary.totals.cases > 0
    ? Number((summary.totals.failed / summary.totals.cases).toFixed(6))
    : 0;

  Object.values(summary.categories).forEach(categoryStats => {
    categoryStats.failureRate = categoryStats.total > 0
      ? Number((categoryStats.failed / categoryStats.total).toFixed(6))
      : 0;
  });

  summary.patterns = Object.entries(summary.patterns)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([patternKey, count]) => ({ patternKey, count }));

  summary.coverage.documentTypesCovered = [...coverageState.documentTypes].sort();
  summary.coverage.documentTypesMissing = SUPPLEMENTAL_DOCUMENT_TYPES.filter(type => !coverageState.documentTypes.has(type));

  if (options.comparePath) {
    try {
      const previousSummary = loadJson(path.resolve(ROOT_DIR, options.comparePath));
      summary.compare = buildComparison(previousSummary, summary);
    } catch (error) {
      summary.compare = {
        error: error.message
      };
    }
  }
}

function buildMarkdownSummary(summary) {
  const lines = [];
  lines.push(`# Regression routeur - ${summary.label}`);
  lines.push('');
  lines.push(`- Cas totaux: ${summary.totals.cases}`);
  lines.push(`- Echecs: ${summary.totals.failed}`);
  lines.push(`- Taux d'echec global: ${formatPercent(summary.totals.failureRate)}`);
  lines.push('');
  lines.push('## Repartition par categorie');
  lines.push('');
  Object.entries(summary.categories)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .forEach(([category, stats]) => {
      lines.push(`- ${category}: ${stats.failed}/${stats.total} en echec (${formatPercent(stats.failureRate)})`);
    });
  lines.push('');
  lines.push('## Top 10 des patterns de bugs');
  lines.push('');
  if (summary.patterns.length === 0) {
    lines.push('- Aucun pattern de bug detecte');
  } else {
    summary.patterns.forEach(pattern => {
      lines.push(`- ${pattern.count} cas: ${pattern.patternKey}`);
    });
  }
  lines.push('');
  lines.push('## Exemples representatifs');
  lines.push('');
  if (summary.examples.failed.length === 0) {
    lines.push('- Aucun echec');
  } else {
    summary.examples.failed.slice(0, 10).forEach(example => {
      lines.push(`- ${example.id} (${example.category}, ${example.deputeId})`);
      lines.push(`  Question: ${example.question}`);
      lines.push(`  Pattern: ${example.patternKey}`);
      lines.push(`  Codes: ${example.failureCodes.join(', ')}`);
    });
  }
  lines.push('');
  lines.push('## Couverture documentaire');
  lines.push('');
  lines.push(`- Types couverts: ${summary.coverage.documentTypesCovered.join(', ') || 'aucun'}`);
  lines.push(`- Types manquants: ${summary.coverage.documentTypesMissing.join(', ') || 'aucun'}`);

  if (summary.compare) {
    lines.push('');
    lines.push('## Comparaison avant/apres');
    lines.push('');
    if (summary.compare.error) {
      lines.push(`- Comparaison indisponible: ${summary.compare.error}`);
    } else {
      lines.push(`- Avant: ${summary.compare.before.failed}/${summary.compare.before.total} en echec (${formatPercent(summary.compare.before.failureRate)})`);
      lines.push(`- Apres: ${summary.compare.after.failed}/${summary.compare.after.total} en echec (${formatPercent(summary.compare.after.failureRate)})`);
      lines.push(`- Delta echecs: ${summary.compare.delta.failed}`);
      lines.push(`- Delta taux: ${formatSignedPercent(summary.compare.delta.failureRate)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function buildComparison(previousSummary, currentSummary) {
  const beforeTotal = Number(previousSummary?.totals?.cases || 0);
  const beforeFailed = Number(previousSummary?.totals?.failed || 0);
  const beforeFailureRate = Number(previousSummary?.totals?.failureRate || 0);
  const afterTotal = Number(currentSummary?.totals?.cases || 0);
  const afterFailed = Number(currentSummary?.totals?.failed || 0);
  const afterFailureRate = Number(currentSummary?.totals?.failureRate || 0);

  return {
    before: {
      total: beforeTotal,
      failed: beforeFailed,
      failureRate: beforeFailureRate
    },
    after: {
      total: afterTotal,
      failed: afterFailed,
      failureRate: afterFailureRate
    },
    delta: {
      failed: afterFailed - beforeFailed,
      failureRate: Number((afterFailureRate - beforeFailureRate).toFixed(6))
    }
  };
}

function inverseVote(vote) {
  if (vote === 'Pour') {
    return 'Contre';
  }
  if (vote === 'Contre') {
    return 'Pour';
  }
  if (vote === 'Abstention') {
    return 'Pour';
  }
  return 'Contre';
}

function buildClosedVoteQuestion(queryText, voteLabel) {
  if (voteLabel === 'Abstention') {
    return `est-ce que ce depute a vote en abstention sur ${queryText} ?`;
  }

  return `est-ce que ce depute a vote ${normalizeText(voteLabel)} ${queryText} ?`;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
