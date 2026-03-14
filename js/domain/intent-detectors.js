import { normalizeQuestion, stripExtractedQueryFromQuestion } from './vote-normalizer.js';
import {
  ANALYSIS_MARKERS,
  LIST_MARKERS,
  SUBJECT_MARKERS,
  TARGET_QUERY_STOPWORDS,
  THEME_KEYWORDS,
} from './router-constants.js';

const CLOSED_THEME_ACTION_REGEX = /\b(soutenu|defendu|defend|rejete|rejette|combattu|favorise|favorisee|favoriser|maintenu|maintenir|protege|proteger|renforce|renforcer|durci|durcir|limite|limiter|interdit|interdire|supprime|supprimer|retabli|retablir|reintroduit|reintroduire|legalise|legaliser|abroge|abroger|augmente|augmenter|baisse|baisser|reduit|reduire)\b/u;
const CLOSED_FORM_REGEX = /^(?:est ce que|est ce qu|a t il|a t elle|ce depute a t il|ce depute a t elle|cette deputee a t elle|mon depute a t il|ma deputee a t elle|mon elu a t il|mon elue a t elle|vote t il|vote t elle)\b/u;
const KNOWN_SPECIFIC_QUERY_PATTERNS = [
  /\b(r[ée]forme des retraites)\b/iu,
  /\b(budget de l[' ]etat)\b/iu,
  /\b(zfe|zones? a faibles emissions)\b/iu,
  /\b(loi duplomb)\b/iu,
  /\b(loi immigration)\b/iu,
  /\b(aide active a mourir|aide a mourir)\b/iu,
  /\b(fin de vie)\b/iu,
  /\b(maprimerenov|ma prime renov)\b/iu
];
const CONTEXTUAL_QUERY_PATTERNS = [
  /(?:comment|quel(?:le)?(?: a ete| est)?(?: le)? vote)[^?]{0,120}\b(?:sur|concernant)\s+(.+)$/iu,
  /(?:comment|quel(?:le)?)[^?]{0,120}\bvot(?:e|é|er)\b[^?]{0,40}\b(?:sur|concernant)\s+(.+)$/iu,
  /\b(?:a[- ]t[- ]il|a[- ]t[- ]elle|ce d[ée]put[ée]|mon d[ée]put[ée]|mon [ée]lu)\b[^?]{0,80}\bvot(?:e|é|er)\b[^?]{0,40}\b(?:sur|concernant)\s+(.+)$/iu,
  /\b(?:a[- ]t[- ]il|a[- ]t[- ]elle)\b[^?]{0,120}\btexte\b\s+(.+)$/iu
];

function cleanExtractedQueryTextInternal(value) {
  return String(value || '')
    .replace(/[?!.,;:]+$/gu, '')
    .replace(/\b(?:en|du|le)\s+\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b.*$/giu, '')
    .replace(/\b(?:en|du|le)\s+(?:1er|[12]?\d|3[01])\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+20\d{2}\b.*$/giu, '')
    .replace(/\ben\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+20\d{2}\b.*$/giu, '')
    .replace(/\ben\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b.*$/giu, '')
    .replace(/\ben\s+20\d{2}\b.*$/giu, '')
    .trim();
}

function matchKnownSpecificQueryInternal(rawQuestion) {
  for (const pattern of KNOWN_SPECIFIC_QUERY_PATTERNS) {
    const match = String(rawQuestion || '').match(pattern);
    if (match?.[1]) {
      return cleanExtractedQueryTextInternal(match[1]);
    }
  }

  return null;
}

function isGenericQueryCandidateInternal(candidate) {
  const normalizedCandidate = normalizeQuestion(candidate);
  if (!normalizedCandidate) {
    return true;
  }

  if (/^(?:ce texte|ce vote|cette loi|un texte|une loi|des textes|le texte|la loi|cette question|ce sujet)\b/.test(normalizedCandidate)) {
    return true;
  }

  const queryTokens = normalizedCandidate
    .split(/[^a-z0-9]+/g)
    .filter(token => token && (token.length >= 4 || /^\d+$/.test(token)) && !TARGET_QUERY_STOPWORDS.has(token));
  const hasShortAcronym = /\b(?:zfe|zan|ame|ivg|plfss|plf|cra|otan|smic)\b/.test(normalizedCandidate);
  const startsWithDocumentType = /^(?:un|une|le|la|les|l)\s+(?:traite|trait[ée]|projet de loi|proposition de loi|loi|motion|amendement|article)\b/.test(normalizedCandidate);

  return queryTokens.length < (startsWithDocumentType ? 1 : 2) && !hasShortAcronym;
}

function questionHasSpecificGroupDetailInternal(normalizedQuestion, scope) {
  if (!/\b(groupe|camp|parti)\b/.test(normalizedQuestion)) {
    return false;
  }

  if (scope?.filters?.theme || scope?.filters?.queryText) {
    return true;
  }

  return (
    /\b(quels?|quelles?)\b/.test(normalizedQuestion) ||
    /\b(votes?|scrutins?|textes?)\b/.test(normalizedQuestion) ||
    /\b(contre son groupe|contre son camp|contre leur groupe|contre leur camp|majorite de son groupe|majorite de son camp)\b/.test(normalizedQuestion)
  );
}

function hasComparativeAnalysisMarkersInternal(normalizedQuestion) {
  const normalizedSearchText = String(normalizedQuestion || '').replace(/['’-]/gu, ' ').replace(/-/g, ' ');
  return (
    /\b(equilibre entre|plus souvent|selon qu on parle|change d avis|changé d avis|coherent|coherente|coherence|contradictoire|stable|evolution|evolue|tiennent ils compte|repondent ils|vision du|vote t il pareil|vote t elle pareil|plutot\b.+\bou\b|plus\b.+\bque\b)\b/.test(normalizedSearchText) ||
    /\b(davantage|privilegient ils|favorisent ils)\b/.test(normalizedSearchText) && /\bou\b/.test(normalizedSearchText) ||
    /\b(defendu|defend|favorise|privilegie|privilégie)\b/.test(normalizedSearchText) && /,/.test(normalizedSearchText) && /\bou\b/.test(normalizedSearchText) ||
    /\b(autorite|egalite des chances|egalite territoriale|liberte d installation|rigueur budgetaire|compromis plus souples|humanitaire|securitaire|budgetaire|atlantistes?|souverainistes?)\b/.test(normalizedSearchText) && /\bou\b/.test(normalizedSearchText)
  );
}

export function detectMarker(question, markers) {
  return markers.some(marker => question.includes(marker));
}

export function detectTheme(question) {
  const normalizedSearchQuestion = String(question || '').replace(/['’-]/gu, ' ');
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(keyword => normalizedSearchQuestion.includes(normalizeQuestion(keyword).replace(/['’-]/gu, ' ')))) {
      return theme;
    }
  }

  return null;
}

export function extractSpecificVoteQuery(question) {
  const rawQuestion = String(question || '').replace(/\s+/g, ' ').trim();
  const normalizedQuestion = normalizeQuestion(rawQuestion);
  const documentQueryMatch = normalizedQuestion.match(
    /((?:projet de loi|proposition de loi|proposition de resolution europeenne|proposition de resolution|resolution europeenne|resolution|declaration du gouvernement|declaration|motion|amendement|article|traite|loi)(?=\s|$).+)$/u
  );
  const rawDocumentQueryMatch = rawQuestion.match(
    /((?:projet de loi|proposition de loi|proposition de r[ée]solution europ[ée]enne|proposition de r[ée]solution|r[ée]solution europ[ée]enne|r[ée]solution|d[ée]claration du gouvernement|d[ée]claration|motion|amendement|article|trait[ée]|loi)(?=\s|$).+)$/iu
  );

  if (documentQueryMatch) {
    const cleanedQuery = cleanExtractedQueryTextInternal(documentQueryMatch[1]);
    const rawCleanedQuery = cleanExtractedQueryTextInternal(rawDocumentQueryMatch?.[1] || '');
    const queryTokens = cleanedQuery
      .split(/[^a-z0-9]+/g)
      .filter(token => token && (token.length >= 4 || /^\d+$/.test(token)) && !TARGET_QUERY_STOPWORDS.has(token));
    const hasNumber = /\b\d+\b/.test(cleanedQuery);

    if (queryTokens.length >= 2 || hasNumber) {
      return rawCleanedQuery || cleanedQuery;
    }
  }

  const knownSpecificQuery = matchKnownSpecificQueryInternal(rawQuestion);
  if (knownSpecificQuery) {
    return knownSpecificQuery;
  }

  for (const pattern of CONTEXTUAL_QUERY_PATTERNS) {
    const match = rawQuestion.match(pattern);
    const candidate = cleanExtractedQueryTextInternal(match?.[1] || '');
    if (candidate && !isGenericQueryCandidateInternal(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function detectVoteFilter(question) {
  if (/\b(abstention|abstentions)\b/.test(question)) {
    return 'Abstention';
  }

  if (/\b(non[- ]?votant|non[- ]?votants)\b/.test(question)) {
    return 'Non-votant';
  }

  if (/\b(?:votes?|scrutins?)\s+contre\b/.test(question) || /\ba vote contre\b/.test(question) || /\bvot(?:e|es|er)\s+contre\b/.test(question)) {
    return 'Contre';
  }

  if (/\b(?:votes?|scrutins?)\s+pour\b/.test(question) || /\ba vote pour\b/.test(question) || /\bvot(?:e|es|er)\s+pour\b/.test(question)) {
    return 'Pour';
  }

  return null;
}

export function detectLimit(question) {
  const explicitPattern = /\b(?:top|premiers?|dernier(?:e|es|s)?|recent(?:e|es|s)?|r[ée]cents?|liste|montre|affiche|donne(?:-moi)?)\D{0,18}(\d{1,3})\b/u;
  const explicitMatch = question.match(explicitPattern);
  if (explicitMatch) {
    return Number(explicitMatch[1]);
  }

  const leadingCountPattern = /\b(\d{1,3})\s+(?:derniers?|premiers?|plus\s+recents?|plus\s+anciens?)\s+(?:votes?|scrutins?)\b/u;
  const leadingCountMatch = question.match(leadingCountPattern);
  if (leadingCountMatch) {
    return Number(leadingCountMatch[1]);
  }

  const countPattern = /\b(\d{1,3})\s+(?:votes?|scrutins?)\b/u;
  const countMatch = question.match(countPattern);
  if (countMatch) {
    return Number(countMatch[1]);
  }

  return null;
}

export function detectSort(question) {
  if (
    /\bplus anciens?\b/.test(question) ||
    /\b(?:les?|ces?)\s+premiers?\s+(?:votes?|scrutins?)\b/.test(question) ||
    /\b\d+\s+premiers?\s+(?:votes?|scrutins?)\b/.test(question)
  ) {
    return 'date_asc';
  }

  return 'date_desc';
}

export function extractDateRange(question) {
  const formatLocalDate = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
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
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const recentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  recentDate.setMonth(recentDate.getMonth() - 6);
  const exactNumericDateMatch = question.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2})\b/u);
  const exactFrenchDateMatch = question.match(/\b(1er|[12]?\d|3[01])\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})\b/u);
  const monthYearMatch = question.match(/\b(?:au\s+mois\s+de\s+|en\s+)?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})\b/u);

  if (exactNumericDateMatch) {
    const day = Number(exactNumericDateMatch[1]);
    const month = Number(exactNumericDateMatch[2]);
    const year = Number(exactNumericDateMatch[3]);
    const candidateDate = new Date(Date.UTC(year, month - 1, day));
    const isValidDate =
      candidateDate.getUTCFullYear() === year &&
      candidateDate.getUTCMonth() === month - 1 &&
      candidateDate.getUTCDate() === day;

    if (isValidDate) {
      const exactDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { dateFrom: exactDate, dateTo: exactDate };
    }

    return { dateFrom: null, dateTo: null };
  }

  if (exactFrenchDateMatch) {
    const rawDay = exactFrenchDateMatch[1];
    const dayNumber = rawDay === '1er' ? 1 : Number(rawDay);
    const monthNumber = Number(monthMap[exactFrenchDateMatch[2]]);
    const yearNumber = Number(exactFrenchDateMatch[3]);
    const candidateDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
    const isValidDate =
      candidateDate.getUTCFullYear() === yearNumber &&
      candidateDate.getUTCMonth() === monthNumber - 1 &&
      candidateDate.getUTCDate() === dayNumber;

    if (isValidDate) {
      const exactDate = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      return { dateFrom: exactDate, dateTo: exactDate };
    }

    return { dateFrom: null, dateTo: null };
  }

  if (monthYearMatch) {
    const month = monthMap[monthYearMatch[1]];
    const year = monthYearMatch[2];
    const lastDayOfMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return {
      dateFrom: `${year}-${month}-01`,
      dateTo: `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`
    };
  }

  if (/\b(?:ce mandat|cette legislature)\b/.test(question)) {
    return { dateFrom: '2022-06-01', dateTo: null };
  }

  if (/\bcette annee\b/.test(question)) {
    return { dateFrom: `${currentYear}-01-01`, dateTo: `${currentYear}-12-31` };
  }

  if (/\b(?:l[' ]annee derniere|annee derniere|l[' ]an dernier|an dernier)\b/.test(question)) {
    const previousYear = currentYear - 1;
    return { dateFrom: `${previousYear}-01-01`, dateTo: `${previousYear}-12-31` };
  }

  if (/\brecemment\b/.test(question) || /\b(?:les?|ces?)\s+\d+\s+derniers?\s+mois\b/.test(question)) {
    return { dateFrom: formatLocalDate(recentDate), dateTo: formatLocalDate(currentDate) };
  }

  const years = [...question.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]));

  if (years.length >= 2 && question.includes('entre')) {
    const sortedYears = [...years].sort((left, right) => left - right);
    return { dateFrom: `${sortedYears[0]}-01-01`, dateTo: `${sortedYears[sortedYears.length - 1]}-12-31` };
  }

  if (years.length >= 1 && (question.includes('depuis') || question.includes('a partir de') || question.includes('a partir du') || question.includes('apres'))) {
    return { dateFrom: `${years[0]}-01-01`, dateTo: null };
  }

  if (years.length >= 1 && question.includes('avant')) {
    return { dateFrom: null, dateTo: `${years[0]}-12-31` };
  }

  if (years.length === 1) {
    return { dateFrom: `${years[0]}-01-01`, dateTo: `${years[0]}-12-31` };
  }

  return { dateFrom: null, dateTo: null };
}

export function detectCountRequest(question) {
  return /\b(combien|nombre|total)\b/.test(question);
}

export function detectSubjectRequest(question) {
  return detectMarker(question, SUBJECT_MARKERS);
}

export function detectThemeSummaryRequest(question) {
  return /\bthemes?\b/.test(question);
}

export function detectListRequest(question) {
  if (detectSubjectRequest(question) || detectCountRequest(question)) {
    return false;
  }

  return (
    detectMarker(question, LIST_MARKERS) ||
    /\b(quels? sont|montre|affiche|liste|donne)\b/.test(question) ||
    /\bplus\s+recents\b/.test(question) ||
    /\bderniers?\s+votes?\b/.test(question) ||
    /\bles\s+derniers\s*\??$/.test(question)
  );
}

export function detectAnalysisRequest(question) {
  return detectMarker(question, ANALYSIS_MARKERS);
}

export function detectThematicStanceRequest(question, scope) {
  if (!scope?.filters?.theme) {
    return false;
  }

  if (hasComparativeAnalysisMarkersInternal(question)) {
    return false;
  }

  return (
    (/\best(?:\s+ce\s+que)?\b/.test(question) && /\b(pour|contre)\b/.test(question)) ||
    /\b(favorable|defavorable|oppose|opposee|plutot)\b/.test(question)
  );
}

export function detectParticipationRateRequest(question) {
  if (
    /\b(comment calcule|calcul du taux|mode de calcul)\b/.test(question) ||
    /^qui\b/.test(question)
  ) {
    return null;
  }

  if (
    /\b(taux de participation|taux de presence|taux de presence global|taux de presence globale|taux de presence aux scrutins|taux de presence dans l hemicycle|assiduite|assidu|presence globale|presence lors des votes)\b/.test(question) ||
    /\b(vote t il souvent|vote-t-il souvent|souvent absent|est il souvent absent|est-il souvent absent|frequence hebdomadaire de presence|fr[ée]quence hebdomadaire de pr[ée]sence)\b/.test(question)
  ) {
    if (/\b(textes importants|grands textes|textes cles|textes clés|specialite|sp[ée]cialit[ée])\b/.test(question)) {
      return 'specialite';
    }

    return 'general';
  }

  return null;
}

export function detectGroupAlignmentRequest(question, scope) {
  if (scope?.filters?.theme || scope?.filters?.queryText) {
    return false;
  }

  if (/^qui\b/.test(question) || /\b(quels?|quelles?)\b/.test(question)) {
    return false;
  }

  return (
    /\b(consigne de son groupe|consigne de votre groupe|discipline de groupe|ligne officielle de son groupe|ligne de son parti|s aligne t il sur son groupe|s aligne t elle sur son groupe|suit il la consigne de son groupe|suit elle la consigne de son groupe|suivi la consigne de son groupe|selon les consignes de son parti politique)\b/.test(question) ||
    /\b(vote t il surtout par discipline de groupe|vote t elle surtout par discipline de groupe)\b/.test(question)
  );
}

export function detectGroupDeviationRequest(question, scope) {
  if (scope?.filters?.theme || scope?.filters?.queryText) {
    return false;
  }

  if (/^qui\b/.test(question) || /\b(quels?|quelles?)\b/.test(question)) {
    return false;
  }

  return /\b(s ecarte t il de son groupe|s ecarte t elle de son groupe|vote diff[ée]remment de son groupe|vote diff[ée]remment de son camp|contre son groupe|contre son camp)\b/.test(question);
}

export function detectScrutinyDetailRequest(question) {
  return (
    /\b(numero exact du scrutin|numero du scrutin|quel scrutin|quelle date et a quelle heure|a quelle date et a quelle heure|date et heure du vote|heure du vote|ou trouver le numero exact)\b/.test(question) ||
    /\b(date de ce vote|date exacte du vote)\b/.test(question)
  );
}

export function detectComparativeThemeAnalysisRequest(question) {
  return hasComparativeAnalysisMarkersInternal(question);
}

export function detectClosedVoteQuestion(question, scope) {
  const normalizedQuestion = normalizeQuestion(question).replace(/-/g, ' ');
  if (hasComparativeAnalysisMarkersInternal(normalizedQuestion)) {
    return false;
  }

  const hasClosedForm = CLOSED_FORM_REGEX.test(normalizedQuestion);
  const hasVoteReference = /\b(vot(?:e|es|er|ait|aient)?|scrutins?)\b/.test(normalizedQuestion);
  const hasThematicAction = CLOSED_THEME_ACTION_REGEX.test(normalizedQuestion);
  const hasSpecificTarget = Boolean(scope?.filters?.queryText || scope?.filters?.theme || scope?.filters?.dateFrom || scope?.filters?.dateTo);
  return hasClosedForm && hasSpecificTarget && (hasVoteReference || hasThematicAction);
}

function hasConcreteRecordedVoteLookupInternal(normalizedQuestion, scope) {
  const hasConcreteTarget = Boolean(
    scope?.filters?.queryText ||
    scope?.filters?.theme ||
    scope?.filters?.vote ||
    scope?.filters?.dateFrom ||
    scope?.filters?.dateTo
  );

  if (!hasConcreteTarget) {
    return false;
  }

  return (
    /\b(?:a t il|a t elle|vote t il|vote t elle)\b/.test(normalizedQuestion) ||
    /\b(?:ce|cet|cette|mon|ma)\s+(?:depute|deputee|elu|elue)\b[^?]{0,80}\b(?:a vote|vot(?:e|er))\b/.test(normalizedQuestion)
  );
}

export function detectUnsupportedQuestion(question) {
  const rawQuestion = String(question || '').trim();
  const normalizedQuestion = normalizeQuestion(rawQuestion).replace(/['’-]/gu, ' ').replace(/-/g, ' ');

  if (/\[[^\]]+\]/.test(rawQuestion)) {
    return {
      reason: 'unsupported',
      signal: 'template_placeholder',
      message: 'Je peux analyser les votes du depute selectionne, mais pas interpreter des gabarits ou repondre comme si j etais le depute.'
    };
  }

  if (
    !/\b(pouvez vous|pourriez vous|peux tu)\b/.test(normalizedQuestion) &&
    (
      /\b(votre vote|votre groupe|avez vous|etes vous|etiez vous|estimez vous|pensez vous|pourquoi avez vous|si oui\b|si non\b|sur quels sujets considerez vous|vous ont convaincu|vous ont pousse|vous ont motiv)\b/.test(normalizedQuestion) ||
      /\b(votez vous|voteriez vous|allez vous|preferez vous|pensez tu|votre positionnement)\b/.test(normalizedQuestion) ||
      /\b(votre|vous|tu)\b/.test(normalizedQuestion) && /\b(vote|votes|motif|avis|position|positionnement|groupe|soutenez|justifiez|electeurs|electorat|conviction|parti)\b/.test(normalizedQuestion)
    )
  ) {
    return {
      reason: 'unsupported',
      signal: 'direct_to_deputy',
      message: 'Je peux decrire les votes enregistres du depute selectionne, mais pas repondre a sa place ni expliquer ses intentions personnelles.'
    };
  }

  if (
    /^qui\b/.test(normalizedQuestion) &&
    !/\b(mon depute|ma deputee|ce depute|cette deputee|a t il|a t elle|vote t il|vote t elle)\b/.test(normalizedQuestion)
  ) {
    return {
      reason: 'too_broad',
      signal: 'global_comparison',
      message: 'Je reponds sur le depute selectionne. Precisez ce depute ou posez une question sur ses votes.'
    };
  }

  if (
    /\b(gouvernement)\b/.test(normalizedQuestion) && /\b(49 3|49\.3)\b/.test(normalizedQuestion) ||
    /\b(utilisation de l article 49 3|utilisation de l'article 49 3|article 49 3 par le gouvernement)\b/.test(normalizedQuestion) ||
    /\b(revoter|revote|revoter apres le senat|apres le senat)\b/.test(normalizedQuestion) && /\b(senat|assemblee)\b/.test(normalizedQuestion) ||
    /\b(texte final|article cle|article clé)\b/.test(normalizedQuestion) && /\b(amendement|amendements|ensemble du texte|contre un article)\b/.test(normalizedQuestion) ||
    /\b(depose un amendement|deposé un amendement|deposer un amendement)\b/.test(normalizedQuestion) && /\b(texte final|vot(?:e|er) contre)\b/.test(normalizedQuestion) ||
    /\bamendements?\b/.test(normalizedQuestion) && /\bgrace a (?:lui|elle)\b/.test(normalizedQuestion)
  ) {
    return {
      reason: 'unsupported',
      signal: 'procedure_lookup',
      message: 'Je peux analyser les votes du depute selectionne, mais pas reconstituer a moi seul le parcours procedural d un texte, des amendements ou du 49.3.'
    };
  }

  if (
    /\b(recevoir une alerte|sites?|medias?|propagande|extrait viral|capture d ecran|compar(er|aison) automatiquement mes opinions|opinion publique|preoccupations actuelles des francais|promesses? de campagne|dons?|meeting|discours?|tiktok|historique telechargeable)\b/.test(normalizedQuestion)
  ) {
    return {
      reason: 'unsupported',
      signal: 'external_or_missing_data',
      message: 'Je peux analyser les votes du depute selectionne, pas recommander des sources externes ni reconstituer opinion publique, dons, discours ou activite reseaux sociaux.'
    };
  }

  if (
    /\b(votera t il|votera t elle|compte t il voter|compte t elle voter|position future|dans l avenir|demain)\b/.test(normalizedQuestion) ||
    /\b(pourquoi)\b/.test(normalizedQuestion) && /\b(a t il|a t elle|a vote|vote|soutenu|rejete|justifie|explique)\b/.test(normalizedQuestion) ||
    /\b(prises de position|prise de position|coherent avec ses discours|coherent avec ses prises de position|perdre des responsabilites)\b/.test(normalizedQuestion)
  ) {
    return {
      reason: 'unsupported',
      signal: 'intent_or_justification',
      message: 'Je peux decrire les votes enregistres, mais pas expliquer avec certitude les intentions, justifications personnelles ou votes futurs d un depute.'
    };
  }

  return null;
}

export function detectClarifyOnlyQuestion(question, scope) {
  const rawQuestion = String(question || '').trim();
  const normalizedQuestion = normalizeQuestion(rawQuestion).replace(/['’-]/gu, ' ').replace(/-/g, ' ');
  const hasConcreteRecordedVoteLookup = hasConcreteRecordedVoteLookupInternal(normalizedQuestion, scope);

  const unsupportedDecision = detectUnsupportedQuestion(question);
  if (unsupportedDecision) {
    return unsupportedDecision;
  }

  if (
    !hasConcreteRecordedVoteLookup &&
    (
      /^(?:qu est ce que|que signifie|comment fonctionne|quelle difference entre|quelle est la difference entre)\b/.test(normalizedQuestion) ||
      /\b(comment lire|analyse officielle d un scrutin|loi est vraiment adoptee|faire tomber le gouvernement|consequences concretes|combien de voix)\b/.test(normalizedQuestion) ||
      /\b(revoter|revote|apres le senat)\b/.test(normalizedQuestion) && /\b(assemblee|senat)\b/.test(normalizedQuestion) ||
      /\b(49 3|49\.3|motion de censure|vote classique|dernier mot|sieges vides|si[eè]ges vides|vote final|amendement|sans vote)\b/.test(normalizedQuestion) && /\b(pourquoi|comment|qu est ce que|que signifie|quelle est la difference)\b/.test(normalizedQuestion) ||
      /\b(vote final|amendement)\b/.test(normalizedQuestion) && /\b(est ce que je regarde|faut il regarder|seulement un vote)\b/.test(normalizedQuestion) ||
      /\b(gouvernement)\b/.test(normalizedQuestion) && /\b(49 3|49\.3)\b/.test(normalizedQuestion) ||
      /\b(confidentialite de leur vote|plusieurs votes differents sur le meme sujet|texte final|article cle|depose un amendement)\b/.test(normalizedQuestion)
    )
  ) {
    return {
      reason: 'unsupported',
      signal: 'procedure_question',
      message: 'Je peux analyser les votes du depute selectionne, mais pas expliquer a moi seul la procedure parlementaire ou constitutionnelle.'
    };
  }

  if (
    !scope?.needsClarification &&
    (
      /^(?:pourquoi\s+)?(?:certains|les)\s+deputes\b/.test(normalizedQuestion) ||
      /^comment\s+les\s+deputes\b/.test(normalizedQuestion) ||
      /^quels?\s+groupes?\b/.test(normalizedQuestion)
    )
  ) {
    return {
      reason: 'unsupported',
      signal: 'collective_actor_lookup',
      message: 'Je reponds sur le depute selectionne et ses votes enregistres, pas sur les autres deputes, les groupes ou leurs motivations collectives.'
    };
  }

  if (
    !scope?.filters?.queryText &&
    (
      /\b(renforce|affaiblit|ameliore)\b/.test(normalizedQuestion) ||
      /\bapprouve\b/.test(normalizedQuestion) && /\bmaintien\b/.test(normalizedQuestion) ||
      /\bprononce\b/.test(normalizedQuestion) && /\ben faveur des?\s+maires ruraux\b/.test(normalizedQuestion)
    ) &&
    (
      Boolean(scope?.filters?.theme) ||
      /\b(vie quotidienne|familles|libertes|maires ruraux)\b/.test(normalizedQuestion)
    )
  ) {
    return {
      reason: 'unsupported',
      signal: 'impact_inference',
      message: 'Je peux decrire des votes enregistres, mais pas conclure de maniere certaine qu un vote renforce, affaiblit ou favorise un groupe sans texte cible explicite.'
    };
  }

  if (
    /\b(delegations? de vote|delegations?|vote solennel|votes solennels|liberte de vote|libert[eé] de vote|division interne|divisions internes)\b/.test(normalizedQuestion) ||
    questionHasSpecificGroupDetailInternal(normalizedQuestion, scope) ||
    /\b(circonscription|electorat|electeurs|interet general|int[eé]r[êe]t g[ée]n[ée]ral|conscience)\b/.test(normalizedQuestion) && /\b(groupe|parti|camp)\b/.test(normalizedQuestion) ||
    /\b(departement|territoire|territoires)\b/.test(normalizedQuestion) && /\b(agriculteurs|commercants|artisans|habitants|riverains)\b/.test(normalizedQuestion) ||
    /\b(commission)\b/.test(normalizedQuestion) && /\b(hemicycle|hémicycle)\b/.test(normalizedQuestion) ||
    /\b(circonscription)\b/.test(normalizedQuestion) && /\b(amendements?|specifiques?)\b/.test(normalizedQuestion) ||
    /\b(sans explication|moyenne de son groupe)\b/.test(normalizedQuestion)
  ) {
    return {
      reason: 'unsupported',
      signal: 'missing_public_data',
      message: 'Je n ai pas ce niveau de detail dans les JSON publics charges. Je peux en revanche repondre sur les votes enregistres, le taux de participation global et l alignement global au groupe.'
    };
  }

  return null;
}

export function stripQueryForDateParsing(question, queryText) {
  const questionWithoutQueryText = stripExtractedQueryFromQuestion(question, queryText);
  return normalizeQuestion(questionWithoutQueryText);
}
