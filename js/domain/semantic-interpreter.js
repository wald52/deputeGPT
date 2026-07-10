import { THEME_KEYWORDS } from './router-constants.js';
import { createIntent, createScope } from './router-primitives.js';
import { normalizeQuestion } from './vote-normalizer.js';

// Niveau 2 de la cascade de routage : quand le routeur deterministe ne comprend
// pas la question (fallback_clarify), un LLM la traduit en operations structurees
// qui sont ensuite validees ici puis executees par les circuits deterministes
// existants. Le LLM ne repond jamais lui-meme : il ne produit qu'un plan.

export const SEMANTIC_INTERPRETER_MIN_CONFIDENCE = 0.55;
export const SEMANTIC_INTERPRETER_MAX_QUESTIONS = 3;
const QUERY_TEXT_MAX_LENGTH = 120;
const SUB_QUESTION_MAX_LENGTH = 240;
const LIMIT_MAX = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MIN = 2017;
const YEAR_MAX = 2035;

export const OPERATION_TO_INTENT_KIND = {
  liste: 'list',
  comptage: 'count',
  sujets: 'subjects',
  analyse: 'analysis',
  position_thematique: 'thematic_stance',
  participation: 'participation_rate'
};

const VOTE_VALUES = new Set(['pour', 'contre', 'abstention']);

function normalizeLookupKeyInternal(value) {
  return normalizeQuestion(value)
    .replace(/['’_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_THEME_KEYS = new Map(
  Object.keys(THEME_KEYWORDS).map(theme => [normalizeLookupKeyInternal(theme), theme])
);

export function buildSemanticInterpreterPrompt(question, context = {}) {
  const themeList = Object.keys(THEME_KEYWORDS).join(', ');
  const systemPrompt = [
    "Tu es l'interprete des questions d'un assistant sur les votes d'un depute francais a l'Assemblee nationale.",
    'Tu ne reponds JAMAIS a la question : tu la traduis en operations structurees.',
    'Renvoie UNIQUEMENT un objet JSON valide, sans markdown ni commentaire.',
    'Schema :',
    '{',
    '  "comprise": boolean,',
    '  "confidence": nombre entre 0 et 1,',
    '  "hypothese": string | null,',
    '  "questions": [',
    '    {',
    '      "intitule": string,',
    '      "operation": "liste" | "comptage" | "sujets" | "analyse" | "position_thematique" | "participation",',
    '      "theme": string | null,',
    '      "texte_cible": string | null,',
    '      "date_debut": "YYYY-MM-DD" | null,',
    '      "date_fin": "YYYY-MM-DD" | null,',
    '      "vote": "pour" | "contre" | "abstention" | null,',
    '      "limite": nombre | null,',
    '      "porte_sur_dernier_resultat": boolean',
    '    }',
    '  ]',
    '}',
    `Themes autorises pour "theme" : ${themeList}.`,
    'Regles :',
    '- "operation" decrit ce qu il faut calculer : liste de votes, comptage, sujets principaux, analyse libre, position du depute sur un theme, taux de participation.',
    '- "position_thematique" exige un "theme" de la liste ; une question d opinion ou de valeurs ("est-il X ?", "que pense-t-il de X ?") releve de "position_thematique" ou "analyse" avec le theme le plus proche.',
    '- "texte_cible" ne sert que si un texte de loi precis est nomme.',
    '- "intitule" reformule la sous-question en francais, courte et autonome.',
    '- Si la requete contient plusieurs questions distinctes, une entree par question, dans l ordre, 3 maximum.',
    '- "comprise" vaut false si la question ne peut pas etre traitee a partir des votes du depute (vie privee, actualite, opinion personnelle non liee aux votes...).',
    '- "hypothese" resume en une phrase ce que tu as compris ; null si comprise=false.',
    '- Si tu hesites, renvoie comprise=false et confidence<=0.5.',
    'Contexte :',
    `- depute actif : ${String(context.deputeName || 'inconnu')}`,
    `- date du jour : ${String(context.today || '')}`,
    `- un resultat precedent est affiche : ${context.hasLastResult ? 'oui' : 'non'}`
  ].join('\n');

  const userMessage = String(question || '').trim();

  return {
    systemPrompt,
    userMessage,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  };
}

export function extractJsonObject(rawText) {
  const text = String(rawText || '')
    .replace(/```json/giu, '')
    .replace(/```/gu, '')
    .trim();
  const firstBraceIndex = text.indexOf('{');
  if (firstBraceIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = firstBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBraceIndex, index + 1);
      }
    }
  }

  return null;
}

export function parseSemanticInterpretation(rawText) {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    return null;
  }
}

function normalizeThemeInternal(theme) {
  const normalizedTheme = normalizeLookupKeyInternal(theme);
  if (!normalizedTheme) {
    return { theme: null, known: true };
  }

  const matchedTheme = NORMALIZED_THEME_KEYS.get(normalizedTheme);
  return matchedTheme
    ? { theme: matchedTheme, known: true }
    : { theme: null, known: false };
}

function normalizeDateInternal(value) {
  const dateText = String(value || '').trim();
  if (!DATE_PATTERN.test(dateText)) {
    return null;
  }

  const year = Number(dateText.slice(0, 4));
  if (!Number.isFinite(year) || year < YEAR_MIN || year > YEAR_MAX) {
    return null;
  }

  return dateText;
}

function normalizeVoteInternal(value) {
  const voteText = normalizeLookupKeyInternal(value);
  return VOTE_VALUES.has(voteText) ? voteText : null;
}

function normalizeLimitInternal(value) {
  const numericLimit = Number(value);
  if (!Number.isFinite(numericLimit) || numericLimit < 1) {
    return null;
  }

  return Math.min(Math.floor(numericLimit), LIMIT_MAX);
}

function normalizeQueryTextInternal(value) {
  const queryText = String(value || '')
    .replace(/["«»]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (queryText.length < 3) {
    return null;
  }

  return queryText.slice(0, QUERY_TEXT_MAX_LENGTH);
}

// Valide une entree "questions" du LLM et la convertit en overrides de routage.
// Retourne null si l'entree est inexploitable (operation inconnue, theme hors
// lexique, position_thematique sans theme...) : on prefere rejeter que deviner.
function buildSubQuestionInternal(entry, session, originalQuestion) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const intentKind = OPERATION_TO_INTENT_KIND[String(entry.operation || '').trim()];
  if (!intentKind) {
    return null;
  }

  const { theme, known: themeIsKnown } = normalizeThemeInternal(entry.theme);
  if (!themeIsKnown) {
    return null;
  }

  if (intentKind === 'thematic_stance' && !theme) {
    return null;
  }

  const queryText = normalizeQueryTextInternal(entry.texte_cible);
  let dateFrom = normalizeDateInternal(entry.date_debut);
  let dateTo = normalizeDateInternal(entry.date_fin);
  if (dateFrom && dateTo && dateFrom > dateTo) {
    dateFrom = null;
    dateTo = null;
  }

  const scope = createScope();
  scope.filters.theme = theme;
  scope.filters.queryText = queryText;
  scope.filters.dateFrom = dateFrom;
  scope.filters.dateTo = dateTo;
  scope.filters.vote = normalizeVoteInternal(entry.vote);
  scope.filters.limit = normalizeLimitInternal(entry.limite);

  const wantsLastResult = entry.porte_sur_dernier_resultat === true
    && Array.isArray(session?.lastResultVoteIds)
    && session.lastResultVoteIds.length > 0;
  if (wantsLastResult) {
    scope.source = 'last_result';
    scope.voteIds = [...session.lastResultVoteIds];
    scope.isFollowUp = true;
  } else if (scope.filters.theme || scope.filters.queryText || scope.filters.vote || scope.filters.dateFrom || scope.filters.dateTo) {
    scope.source = 'explicit_filter';
  }

  const intent = createIntent();
  intent.kind = intentKind;
  intent.confidence = 1;
  intent.signals = ['semantic_interpreter'];
  intent.reason = null;

  const subQuestionText = String(entry.intitule || '').replace(/\s+/g, ' ').trim();

  return {
    question: subQuestionText ? subQuestionText.slice(0, SUB_QUESTION_MAX_LENGTH) : String(originalQuestion || '').trim(),
    intentKind,
    scopeOverride: scope,
    intentOverride: intent
  };
}

export function resolveSemanticInterpretation(rawText, session, originalQuestion) {
  const parsed = parseSemanticInterpretation(rawText);
  if (!parsed || parsed.comprise !== true) {
    return null;
  }

  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < SEMANTIC_INTERPRETER_MIN_CONFIDENCE) {
    return null;
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return null;
  }

  const subQuestions = [];
  let hasAnalysisSubQuestion = false;
  for (const entry of parsed.questions) {
    if (subQuestions.length >= SEMANTIC_INTERPRETER_MAX_QUESTIONS) {
      break;
    }

    const subQuestion = buildSubQuestionInternal(entry, session, originalQuestion);
    if (!subQuestion) {
      continue;
    }

    // Une seule synthese LLM par requete : les analyses au-dela de la premiere
    // sont ecartees pour contenir latence et couts.
    if (subQuestion.intentKind === 'analysis') {
      if (hasAnalysisSubQuestion) {
        continue;
      }
      hasAnalysisSubQuestion = true;
    }

    subQuestions.push(subQuestion);
  }

  if (subQuestions.length === 0) {
    return null;
  }

  const hypothese = String(parsed.hypothese || '').replace(/\s+/g, ' ').trim();

  return {
    confidence: Math.min(1, Math.max(0, confidence)),
    assumptionText: hypothese ? `Interprétation IA : ${hypothese}` : null,
    subQuestions
  };
}
