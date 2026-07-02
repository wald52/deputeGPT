import { stripLeadingFrenchArticle } from './vote-title-display.js';

const LAW_CRITIQUE_VERDICT_LABELS = {
  incitations_alignees: '✅ Incitations alignées avec l\'objectif affiché',
  incitations_mitigees: '⚖️ Incitations mitigées par rapport à l\'objectif affiché',
  incitations_opposees: '⚠️ Incitations opposées à l\'objectif affiché',
  indetermine: '❓ Indéterminé : le texte analysé ne permet pas de trancher'
};

function sortVotesByDateDescInternal(votes) {
  return [...(votes || [])].sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')));
}

async function buildLawCritiqueResponseInternal(question, route, depute, context, deps) {
  const queryText = route.scope.filters.queryText || '';
  const deputeLabel = `${depute.prenom} ${depute.nom}`;
  const canLookupDossier = typeof deps.findDossierByQuery === 'function';
  const canLoadFiche = typeof deps.loadDossierFiche === 'function';

  const dossierMatch = canLookupDossier ? await deps.findDossierByQuery(queryText) : null;

  // Votes du député sur ce texte : via les scrutins du dossier si résolu,
  // sinon via le filtre lexical classique sur le texte cible.
  let deputeVotesOnText = context.deputeQueryMatches || [];
  if (dossierMatch?.dossier?.scrutinNumeros?.length) {
    const dossierNumeros = new Set(dossierMatch.dossier.scrutinNumeros.map(String));
    const votesOnDossier = (depute?.votes || []).filter(vote => dossierNumeros.has(String(vote.numero)));
    if (votesOnDossier.length > 0) {
      deputeVotesOnText = votesOnDossier;
    }
  }
  deputeVotesOnText = sortVotesByDateDescInternal(deputeVotesOnText);

  if (!dossierMatch && deputeVotesOnText.length === 0) {
    return {
      kind: 'clarify',
      message: `Je n'ai pas identifié le texte de loi visé par « ${queryText} ». Précisez le titre exact du texte ou de la loi.`,
      clarificationKind: null
    };
  }

  const fiche = dossierMatch && canLoadFiche ? await deps.loadDossierFiche(dossierMatch.dossierId) : null;
  const displayedVotes = deputeVotesOnText.slice(0, deps.defaultChatListLimit);
  const messageParts = [];

  if (fiche) {
    const verdictLabel = LAW_CRITIQUE_VERDICT_LABELS[fiche.verdictIncitations] || LAW_CRITIQUE_VERDICT_LABELS.indetermine;
    messageParts.push(`Fiche d'analyse : ${fiche.titre || dossierMatch.dossier.titre}`);
    if (fiche.objectifAffiche) {
      messageParts.push(`Objectif affiché : ${fiche.objectifAffiche}`);
    }
    messageParts.push(`Verdict : ${verdictLabel}`);
    if (fiche.justificationVerdict) {
      messageParts.push(`Justification : ${fiche.justificationVerdict}`);
    }

    const mecanismes = (fiche.mecanismesCles || []).slice(0, 3);
    if (mecanismes.length > 0) {
      messageParts.push(
        'Mécanismes clés :\n' + mecanismes
          .map(mecanisme => `- ${mecanisme.resume}${mecanisme.articleRef ? ` (${mecanisme.articleRef})` : ''}`)
          .join('\n')
      );
    }
  } else if (dossierMatch) {
    messageParts.push(
      `J'ai identifié le texte « ${dossierMatch.dossier.titre} », mais sa fiche d'analyse n'est pas encore disponible. ` +
      'Je ne peux donc pas juger si ses incitations vont dans le sens de son objectif affiché.'
    );
  } else {
    messageParts.push(
      `Je n'ai pas relié « ${queryText} » à un dossier législatif précis : je ne peux pas juger son contenu, ` +
      'mais voici les votes enregistrés correspondants.'
    );
  }

  if (deputeVotesOnText.length > 0) {
    messageParts.push(
      `Votes de ${deputeLabel} sur ce texte : ${deputeVotesOnText.length} scrutin${deputeVotesOnText.length > 1 ? 's' : ''} (détail en références ci-dessous).`
    );
  } else {
    messageParts.push(`${deputeLabel} n'a aucun vote enregistré sur ce texte.`);
  }

  if (fiche) {
    const sourceLinks = [fiche.sources?.texteAn, fiche.sources?.dossierAn].filter(Boolean);
    messageParts.push(
      `⚠️ ${fiche.disclaimer || 'Analyse générée automatiquement par IA, à vérifier sur les sources officielles.'}` +
      (sourceLinks.length ? `\nSources : ${sourceLinks.join(' | ')}` : '')
    );
  } else if (dossierMatch?.dossier?.anUrl) {
    messageParts.push(`Source : ${dossierMatch.dossier.anUrl}`);
  }

  return {
    kind: 'response',
    message: messageParts.join('\n\n'),
    voteIds: deputeVotesOnText.map(deps.getVoteId),
    displayedVoteIds: displayedVotes.map(deps.getVoteId),
    lawCritique: {
      dossierId: dossierMatch?.dossierId || null,
      dossierTitre: dossierMatch?.dossier?.titre || null,
      matchConfidence: dossierMatch?.confidence || null,
      verdictIncitations: fiche?.verdictIncitations || null,
      hasFiche: Boolean(fiche),
      sources: fiche?.sources || (dossierMatch?.dossier?.anUrl ? { dossierAn: dossierMatch.dossier.anUrl } : null),
      disclaimer: fiche?.disclaimer || null
    }
  };
}

function buildClosedVoteResponseInternal(question, scope, depute, filteredVotes, context = {}, deps) {
  const { deputeQueryMatches = [], globalQueryMatches = [] } = context;
  const displayedVotes = filteredVotes.slice(0, scope.filters.limit || deps.defaultChatListLimit);
  const phrasingContext = {
    ...context,
    filteredVotes,
    displayedVotes
  };
  const targetDescription = deps.describeClosedVoteTarget(scope.filters, phrasingContext);
  const deputeLabel = `${depute.prenom} ${depute.nom}`;

  if (filteredVotes.length > 0) {
    let summaryText = `Oui. ${deputeLabel} a ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''}`;
    if (targetDescription) {
      summaryText += ` ${targetDescription}`;
    }
    summaryText += '.';

    if (displayedVotes.length > 0) {
      if (displayedVotes.length < filteredVotes.length) {
        summaryText += `\nJ'en affiche ${displayedVotes.length}, triés par date.`;
      }

      return buildInlineListResponseInternal(summaryText, displayedVotes, 'list', deps);
    }

    return {
      kind: 'response',
      message: summaryText,
      displayedVotes
    };
  }

  if (scope.filters.queryText) {
    let message = `Non. Je ne trouve aucun vote ${deps.describeQueryVotePhrase(scope.filters, phrasingContext)} enregistré pour ${deputeLabel} sur cette législature.`;

    if (scope.filters.vote && deputeQueryMatches.length > 0) {
      const distributionText = formatVoteDistributionInternal(buildVoteDistributionInternal(deputeQueryMatches));
      message += ` En revanche, je trouve ${deputeQueryMatches.length} scrutin${deputeQueryMatches.length > 1 ? 's' : ''} correspondant${deputeQueryMatches.length > 1 ? 's' : ''} pour ce député`;
      if (distributionText) {
        message += ` (${distributionText})`;
      }
      message += ', mais pas avec ce sens de vote.';
      return {
        kind: 'response',
        message,
        displayedVotes: []
      };
    }

    if (globalQueryMatches.length > 0) {
      message += ` Je trouve toutefois ${globalQueryMatches.length} scrutin${globalQueryMatches.length > 1 ? 's' : ''} correspondant${globalQueryMatches.length > 1 ? 's' : ''} dans la base de cette législature. Il est donc possible que ce député n'ait pas pris part au vote ou qu'aucun vote ne soit enregistré pour lui sur ce${globalQueryMatches.length > 1 ? 's' : ''} scrutin${globalQueryMatches.length > 1 ? 's' : ''}.`;
    }

    return {
      kind: 'response',
      message,
      displayedVotes: []
    };
  }

  let message = `Non. ${deputeLabel} n'a aucun vote`;
  if (targetDescription) {
    message += ` ${targetDescription}`;
  }
  message += '.';

  return {
    kind: 'response',
    message,
    displayedVotes: []
  };
}

function buildNoResultMessageInternal(scope, intent, context = {}, deps) {
  if (intent.kind === 'count') {
    return 'Je ne trouve aucun vote correspondant à ce filtre.';
  }

  const { deputeQueryMatches = [], globalQueryMatches = [] } = context;
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, context);
  if (queryDescription && !dateDescription) {
    let message = `Je ne trouve aucun vote ${deps.describeQueryVotePhrase(scope.filters, context)} sur cette législature.`;

    if (scope.filters.vote && deputeQueryMatches.length > 0) {
      return `${message} En revanche, je trouve ${deputeQueryMatches.length} scrutin${deputeQueryMatches.length > 1 ? 's' : ''} correspondant${deputeQueryMatches.length > 1 ? 's' : ''} pour ce député, mais pas avec ce sens de vote.`;
    }

    if (globalQueryMatches.length > 0) {
      message += ` Je trouve toutefois ${globalQueryMatches.length} scrutin${globalQueryMatches.length > 1 ? 's' : ''} correspondant${globalQueryMatches.length > 1 ? 's' : ''} dans la base de cette législature. Il est donc possible que ce député n'ait pas pris part au vote ou qu'aucun vote ne soit enregistré pour lui sur ce${globalQueryMatches.length > 1 ? 's' : ''} scrutin${globalQueryMatches.length > 1 ? 's' : ''}.`;
    }

    return message;
  }

  let message = 'Je ne trouve aucun vote correspondant';
  if (scope.filters.vote) {
    message += ` avec le vote "${scope.filters.vote}"`;
  }
  if (queryDescription) {
    message += ` pour ${queryDescription}`;
  }
  if (scope.filters.theme) {
    message += ` sur le thème "${scope.filters.theme}"`;
  }
  if (dateDescription) {
    if (dateDescription.startsWith('le ')) {
      message += ` à la date du ${dateDescription.slice(3)}`;
    } else {
      message += ` ${dateDescription}`;
    }
  }

  return message === 'Je ne trouve aucun vote correspondant'
    ? 'Je ne trouve aucun vote correspondant à votre demande.'
    : `${message}.`;
}

function buildCountResponseInternal(filteredVotes, scope, depute, deps) {
  const filterBits = [];
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, { filteredVotes });
  if (scope.filters.vote) {
    filterBits.push(`votes "${scope.filters.vote}"`);
  } else {
    filterBits.push('votes');
  }

  if (queryDescription) {
    filterBits.push(`pour ${queryDescription}`);
  }

  if (scope.filters.theme) {
    filterBits.push(`sur le thème "${scope.filters.theme}"`);
  }

  if (dateDescription) {
    filterBits.push(dateDescription);
  }

  const total = filteredVotes.length;
  return `${depute.prenom} ${depute.nom} a ${total} ${filterBits.join(' ')}.`;
}

function buildLargeResultHintInternal(requestedLimit, totalMatches) {
  const remainingMatches = Math.max(0, totalMatches - requestedLimit);
  const nextSuggestedLimit = requestedLimit < 20
    ? Math.min(20, totalMatches)
    : requestedLimit < 50
      ? Math.min(50, totalMatches)
      : null;

  if (remainingMatches <= 0) {
    return '';
  }

  if (nextSuggestedLimit && nextSuggestedLimit > requestedLimit) {
    return `Dites "${nextSuggestedLimit} derniers" si vous voulez élargir directement, ou utilisez "Afficher ${Math.min(requestedLimit, remainingMatches)} de plus".`;
  }

  return 'Utilisez le bouton "Afficher plus" pour continuer.';
}

function buildInlineListResponseInternal(summaryText, displayedVotes, inlineVoteMode, deps) {
  const trimmedSummaryText = String(summaryText || '').trimEnd();
  const lines = Array.isArray(displayedVotes) && displayedVotes.length > 0
    ? displayedVotes.map(vote => deps.formatVoteLine(vote, inlineVoteMode)).join('\n')
    : '';
  const message = lines ? `${trimmedSummaryText}\n${lines}` : trimmedSummaryText;

  return {
    kind: 'response',
    message,
    summaryText: trimmedSummaryText,
    displayedVotes,
    referencePresentation: lines ? 'inline_rows' : null,
    inlineVoteMode: lines ? inlineVoteMode : null
  };
}

function buildListResponseInternal(filteredVotes, scope, depute, deps) {
  const requestedLimit = scope.filters.limit || deps.defaultChatListLimit;
  const displayedVotes = filteredVotes.slice(0, requestedLimit);
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, { filteredVotes, displayedVotes });
  const introParts = [`${depute.prenom} ${depute.nom} a ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''} correspondant${filteredVotes.length > 1 ? 's' : ''}`];

  if (queryDescription) {
    introParts.push(`pour ${queryDescription}`);
  }

  if (scope.filters.theme) {
    introParts.push(`au thème "${scope.filters.theme}"`);
  }

  if (scope.filters.vote) {
    introParts.push(`avec le vote "${scope.filters.vote}"`);
  }

  if (dateDescription) {
    introParts.push(dateDescription);
  }

  let summaryText = `${introParts.join(' ')}.`;
  if (displayedVotes.length < filteredVotes.length) {
    summaryText += `\nJ'en affiche ${displayedVotes.length}, triés par date. ${buildLargeResultHintInternal(displayedVotes.length, filteredVotes.length)}`;
  }

  return buildInlineListResponseInternal(summaryText, displayedVotes, 'list', deps);
}

function buildThemeSummaryResponseInternal(filteredVotes, scope, depute, deps) {
  const themeCounts = new Map();

  filteredVotes.forEach(vote => {
    const themeLabel = deps.inferVoteThemeLabel(vote);
    if (themeLabel) {
      themeCounts.set(themeLabel, (themeCounts.get(themeLabel) || 0) + 1);
    }
  });

  const rankedThemes = [...themeCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return String(left[0]).localeCompare(String(right[0]));
    });

  if (rankedThemes.length === 0 && !scope.filters.theme) {
    return null;
  }

  let message = `Thèmes principaux parmi les ${filteredVotes.length} votes retenus pour ${depute.prenom} ${depute.nom} :`;

  if (rankedThemes.length === 0) {
    message += `\n- ${scope.filters.theme} : ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''}`;
  } else {
    message += '\n';
    message += rankedThemes
      .map(([theme, count]) => `- ${theme} : ${count} vote${count > 1 ? 's' : ''}`)
      .join('\n');
  }

  return {
    kind: 'response',
    message,
    displayedVotes: filteredVotes
  };
}

function buildSubjectsResponseInternal(filteredVotes, scope, depute, question, deps) {
  if (deps.detectThemeSummaryRequest(deps.normalizeQuestion(question))) {
    const themeSummaryResponse = buildThemeSummaryResponseInternal(filteredVotes, scope, depute, deps);
    if (themeSummaryResponse) {
      return themeSummaryResponse;
    }
  }

  const requestedLimit = scope.filters.limit || deps.defaultChatListLimit;
  const displayedVotes = filteredVotes.slice(0, requestedLimit);
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, { filteredVotes, displayedVotes });
  let summaryText = `Voici les sujets des ${displayedVotes.length} vote${displayedVotes.length > 1 ? 's' : ''} retenu${displayedVotes.length > 1 ? 's' : ''} pour ${depute.prenom} ${depute.nom}`;

  if (queryDescription) {
    summaryText += ` pour ${queryDescription}`;
  }

  if (dateDescription) {
    summaryText += ` ${dateDescription}`;
  }

  if (filteredVotes.length > displayedVotes.length) {
    summaryText += ` (sur ${filteredVotes.length} correspondances)`;
  }

  summaryText += ' :';
  if (displayedVotes.length < filteredVotes.length) {
    summaryText += `\n${buildLargeResultHintInternal(displayedVotes.length, filteredVotes.length)}`;
  }

  return buildInlineListResponseInternal(summaryText, displayedVotes, 'subjects', deps);
}

function formatPercentInternal(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  const normalizedValue = value > 1 ? value / 100 : value;
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: normalizedValue >= 0.1 ? 1 : 0
  }).format(normalizedValue);
}

function formatVoteDateInternal(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return isoDate || 'date non renseignée';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

function buildParticipationRateResponseInternal(question, depute, route) {
  const deputeLabel = `${depute.prenom} ${depute.nom}`;
  const overallScore = Number(depute?.scoreParticipation);
  const specialtyScore = Number(depute?.scoreParticipationSpecialite);
  const wantsSpecialty = Array.isArray(route?.intent?.signals) && route.intent.signals.includes('participation_specialite');
  const normalizedQuestion = String(question || '').toLowerCase();
  const parts = [];

  if (Number.isFinite(overallScore)) {
    parts.push(`${deputeLabel} a un score de participation global de ${formatPercentInternal(overallScore)} aux scrutins publics de cette législature.`);
  }

  if (Number.isFinite(specialtyScore)) {
    parts.push(`Son score de participation de spécialité est de ${formatPercentInternal(specialtyScore)}.`);
  } else if (wantsSpecialty) {
    parts.push("Je n'ai pas de score de participation de spécialité exploitable dans les données chargées.");
  }

  if (!parts.length) {
    return {
      kind: 'response',
      message: `Je n'ai pas de score de participation exploitable pour ${deputeLabel} dans les données publiques chargées.`
    };
  }

  if (/\b(hebdomadaire|seance pleniere|séance plénière|heure|jour)\b/.test(normalizedQuestion)) {
    parts.push("Je ne dispose pas d'une fréquence par semaine ou par séance dans les données publiques chargées.");
  } else if (/\b(absent|absence)\b/.test(normalizedQuestion) && Number.isFinite(overallScore)) {
    parts.push(`Cela correspond à une participation ${overallScore >= 0.6 ? 'plutôt régulière' : overallScore >= 0.35 ? 'mitigée' : 'plutôt faible'} sur les scrutins publics.`);
  }

  return {
    kind: 'response',
    message: parts.join(' ')
  };
}

function buildGroupAlignmentResponseInternal(question, depute, route) {
  const deputeLabel = `${depute.prenom} ${depute.nom}`;
  const loyaltyScore = Number(depute?.scoreLoyaute);
  const groupLabel = depute?.groupeAbrev || depute?.groupe || 'son groupe';
  const normalizedQuestion = String(question || '').toLowerCase();

  if (!Number.isFinite(loyaltyScore)) {
    return {
      kind: 'response',
      message: `Je n'ai pas de score de loyauté exploitable pour ${deputeLabel} dans les données publiques chargées.`
    };
  }

  const normalizedLoyaltyScore = loyaltyScore > 1 ? loyaltyScore / 100 : loyaltyScore;
  const gapScore = Math.max(0, 1 - normalizedLoyaltyScore);
  const loyaltyText = formatPercentInternal(loyaltyScore);
  const gapText = formatPercentInternal(gapScore);
  const followsGroup = normalizedLoyaltyScore >= 0.75;
  const responseParts = route.intent.kind === 'group_gap'
    ? [`${deputeLabel} a un score de loyauté de ${loyaltyText} avec le groupe ${groupLabel}. Cela suggère un écart global indicatif d'environ ${gapText} par rapport à la ligne du groupe.`]
    : [`${deputeLabel} a un score de loyauté de ${loyaltyText} avec le groupe ${groupLabel}. Cela suggère qu'il ${followsGroup ? 'suit plutôt souvent' : 'suit de façon plus variable'} la ligne de son groupe.`];

  if (/\b(circonscription|electorat|electeurs)\b/.test(normalizedQuestion)) {
    responseParts.push("Je peux mesurer l'alignement global au groupe, pas l'effet direct de la circonscription dans ces données.");
  }

  responseParts.push("Je n'ai pas le détail scrutin par scrutin des consignes ou des écarts internes du groupe dans les JSON publics chargés.");

  return {
    kind: 'response',
    message: responseParts.join(' ')
  };
}

function buildScrutinyDetailResponseInternal(filteredVotes, question, deps) {
  const normalizedQuestion = deps.normalizeQuestion(question);
  const asksHour = /\bheures?\b/.test(normalizedQuestion);
  const displayedVotes = filteredVotes.slice(0, deps.defaultChatListLimit);

  if (filteredVotes.length === 1) {
    const vote = filteredVotes[0];
    const displayTitle = stripLeadingFrenchArticle(vote?.titre || '');
    let message = `Le scrutin ${deps.getVoteId(vote)} a eu lieu le ${formatVoteDateInternal(vote?.date)}.`;

    if (displayTitle) {
      message += ` Intitulé retenu : ${displayTitle}.`;
    }

    if (asksHour) {
      message += " Je dispose de la date, pas de l'heure, dans les données publiques chargées.";
    }

    return {
      kind: 'response',
      message,
      displayedVotes
    };
  }

  let message = `Je trouve ${filteredVotes.length} scrutins correspondants. Voici les numéros et dates des ${displayedVotes.length} premiers :\n`;
  message += displayedVotes
    .map(vote => `- scrutin ${deps.getVoteId(vote)} - ${formatVoteDateInternal(vote?.date)} - ${stripLeadingFrenchArticle(vote?.titre || '') || 'scrutin sans titre'}`)
    .join('\n');

  if (asksHour) {
    message += '\nJe dispose des dates, pas des heures, dans les données publiques chargées.';
  }

  return {
    kind: 'response',
    message,
    displayedVotes
  };
}

function buildVoteDistributionInternal(votes) {
  return votes.reduce((distribution, vote) => {
    const key = vote?.vote || 'Autre';
    distribution[key] = (distribution[key] || 0) + 1;
    distribution.total += 1;
    return distribution;
  }, {
    total: 0,
    Pour: 0,
    Contre: 0,
    Abstention: 0,
    'Non-votant': 0,
    Autre: 0
  });
}

function formatVoteDistributionInternal(distribution) {
  const orderedEntries = [
    ['Pour', 'pour'],
    ['Contre', 'contre'],
    ['Abstention', 'abstention'],
    ['Non-votant', 'non-votant'],
    ['Autre', 'autre']
  ];

  const parts = orderedEntries
    .filter(([key]) => distribution[key] > 0)
    .map(([key, label]) => `${distribution[key]} ${label}${distribution[key] > 1 ? 's' : ''}`);

  return parts.join(', ');
}


// Ne jamais deduire une « position » d'un comptage pour/contre sur un bucket
// thematique : la polarite des votes sur amendements est inconnaissable (voter
// contre un amendement restrictif = soutenir la cause). La reponse s'appuie sur
// les votes « ensemble du texte », croises avec les fiches de lois quand elles
// existent, et presente le decompte global comme une repartition brute avertie.
const STANCE_ENSEMBLE_DISPLAY_LIMIT = 6;
const STANCE_FICHE_DISPLAY_LIMIT = 3;
const STANCE_TERM_STOPWORDS = new Set([
  'depute', 'deputee', 'deputes', 'cette', 'votre', 'notre', 'plutot', 'vraiment',
  'reellement', 'favorable', 'defavorable', 'oppose', 'opposee', 'position',
  'soutient', 'soutenu', 'soutenue', 'defend', 'defendu', 'votes', 'scrutins', 'textes'
]);

function classifyStanceVoteKindInternal(vote, deps) {
  const normalizedTitle = deps.normalizeQuestion(vote?.titre || '').replace(/['’-]/gu, ' ');
  if (/^l\s*ensemble\b/.test(normalizedTitle)) {
    return 'ensemble';
  }
  if (/\bamendement/.test(normalizedTitle)) {
    return 'amendement';
  }
  return 'autre';
}

function extractStanceQueryTermsInternal(question, theme, deps) {
  const themeKeywordWords = new Set();
  (deps.themeKeywords?.[theme] || []).forEach(keyword => {
    deps.normalizeQuestion(keyword)
      .replace(/['’-]/gu, ' ')
      .split(/[^a-z0-9]+/)
      .forEach(word => {
        if (word) {
          themeKeywordWords.add(word);
        }
      });
  });

  return deps.normalizeQuestion(question)
    .replace(/['’-]/gu, ' ')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 5 && !STANCE_TERM_STOPWORDS.has(token))
    .filter(token => {
      for (const word of themeKeywordWords) {
        if (
          token === word ||
          (word.length >= 5 && token.startsWith(word)) ||
          (token.length >= 5 && word.startsWith(token))
        ) {
          return false;
        }
      }
      return true;
    });
}

function filterVotesByStanceTermsInternal(votes, terms, deps) {
  if (terms.length === 0) {
    return { votes, applied: false, matched: false };
  }

  const matchedVotes = votes.filter(vote => {
    const indexText = typeof deps.lookupVoteIndexText === 'function'
      ? deps.lookupVoteIndexText(vote) || ''
      : '';
    const haystack = deps.normalizeQuestion(`${vote?.titre || ''} ${indexText}`);
    return terms.some(term => haystack.includes(term));
  });

  return matchedVotes.length > 0
    ? { votes: matchedVotes, applied: true, matched: true }
    : { votes, applied: true, matched: false };
}

async function buildThematicStanceResponseInternal(filteredVotes, scope, depute, question, deps) {
  const themeLabel = scope.filters.theme || 'ce thème';
  const deputeLabel = `${depute.prenom} ${depute.nom}`;
  const terms = extractStanceQueryTermsInternal(question, scope.filters.theme, deps);
  const termFilter = filterVotesByStanceTermsInternal(filteredVotes, terms, deps);
  const scopedVotes = termFilter.votes;
  const termsLabel = terms.map(term => `« ${term} »`).join(' ou ');

  const ensembleVotes = [];
  let amendementCount = 0;
  scopedVotes.forEach(vote => {
    const kind = classifyStanceVoteKindInternal(vote, deps);
    if (kind === 'ensemble') {
      ensembleVotes.push(vote);
    } else if (kind === 'amendement') {
      amendementCount += 1;
    }
  });
  ensembleVotes.sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')));

  const displayedVotes = ensembleVotes.length > 0
    ? ensembleVotes.slice(0, STANCE_ENSEMBLE_DISPLAY_LIMIT)
    : scopedVotes.slice(0, deps.thematicStanceExampleLimit);
  const distributionText = formatVoteDistributionInternal(buildVoteDistributionInternal(scopedVotes));

  const messageParts = [];

  if (termFilter.applied && termFilter.matched) {
    messageParts.push(`Scrutins du thème "${themeLabel}" mentionnant ${termsLabel} : ${scopedVotes.length}.`);
  } else if (termFilter.applied && !termFilter.matched) {
    messageParts.push(`Aucun scrutin ne mentionne ${termsLabel} : je réponds sur le thème "${themeLabel}" dans son ensemble.`);
  }

  if (ensembleVotes.length > 0) {
    messageParts.push(
      `Les votes les plus significatifs de ${deputeLabel} sur ce sujet sont ceux sur l'ensemble des textes ` +
      `(${ensembleVotes.length} scrutin${ensembleVotes.length > 1 ? 's' : ''}, détail ci-dessous).`
    );

    if (typeof deps.getFicheForVote === 'function') {
      const ficheLines = [];
      for (const vote of displayedVotes.slice(0, STANCE_FICHE_DISPLAY_LIMIT)) {
        try {
          const fiche = await deps.getFicheForVote(deps.getVoteId(vote));
          if (fiche) {
            const verdictLabel = LAW_CRITIQUE_VERDICT_LABELS[fiche.verdictIncitations] || LAW_CRITIQUE_VERDICT_LABELS.indetermine;
            const objectif = String(fiche.objectifAffiche || '').slice(0, 180);
            ficheLines.push(`- [${vote.date}] ${vote.vote} — ${fiche.titre}${objectif ? `\n  Objectif affiché : ${objectif}` : ''}\n  Fiche IA : ${verdictLabel}`);
          }
        } catch (error) {
          // Fiche indisponible : non bloquant.
        }
      }

      if (ficheLines.length > 0) {
        messageParts.push(
          `Lecture avec les fiches d'analyse (générées par IA, à vérifier sur les sources officielles) :\n${ficheLines.join('\n')}`
        );
      }
    }
  } else {
    messageParts.push(
      `${deputeLabel} n'a aucun vote sur l'ensemble d'un texte dans ce périmètre : ` +
      `impossible d'en dégager une position fiable. Voici les votes les plus récents du thème.`
    );
  }

  if (distributionText) {
    let distributionLine = `Répartition brute des ${scopedVotes.length} votes du thème : ${distributionText}`;
    if (amendementCount > 0) {
      distributionLine += `, dont ${amendementCount} sur des amendements`;
    }
    messageParts.push(`${distributionLine}.`);
  }

  if (amendementCount > 0) {
    messageParts.push(
      '⚠️ Les votes sur amendements ne sont pas interprétables tels quels : voter contre un amendement ' +
      'restrictif peut soutenir la cause, et inversement. Je ne déduis donc pas de « position » globale de ce décompte.'
    );
  }

  const summaryText = messageParts.join('\n\n');
  if (displayedVotes.length > 0) {
    return buildInlineListResponseInternal(`${summaryText}\n\nDétail :`, displayedVotes, 'list', deps);
  }

  return {
    kind: 'response',
    message: summaryText,
    displayedVotes: []
  };
}

export function createDeterministicRouteExecutor(deps) {
  return function executeDeterministicRoute(route, question, depute) {
    const scopedVotes = deps.resolveScopeVotes(route.scope, depute?.votes || []);
    const filteredVotes = deps.applyScopeFilters(scopedVotes, route.scope, question);
    const isClosedVoteQuestion = deps.detectClosedVoteQuestion(question, route.scope);
    const baseResult = {
      plan: route.plan || null,
      scopeSource: route.scope.source,
      filters: route.scope.filters,
      sort: route.scope.filters.sort,
      limit: route.scope.filters.limit
    };
    const deputeQueryMatches = route.scope.filters.queryText && route.scope.filters.vote
      ? deps.applyScopeFilters(scopedVotes, {
        ...route.scope,
        filters: {
          ...route.scope.filters,
          vote: null
        }
      }, question)
      : [];
    const globalQueryMatches = route.scope.filters.queryText
      ? deps.findGlobalVotesByQuery(route.scope.filters.queryText)
      : [];

    if (route.intent.kind === 'participation_rate') {
      return {
        kind: 'response',
        message: buildParticipationRateResponseInternal(question, depute, route).message,
        voteIds: [],
        displayedVoteIds: [],
        ...baseResult
      };
    }

    if (route.intent.kind === 'group_alignment' || route.intent.kind === 'group_gap') {
      return {
        kind: 'response',
        message: buildGroupAlignmentResponseInternal(question, depute, route).message,
        voteIds: [],
        displayedVoteIds: [],
        ...baseResult
      };
    }

    if (route.intent.kind === 'law_critique') {
      // Seule branche asynchrone : elle charge l'index dossiers et la fiche à la demande.
      return buildLawCritiqueResponseInternal(question, route, depute, {
        deputeQueryMatches: deputeQueryMatches.length > 0 ? deputeQueryMatches : filteredVotes
      }, deps).then(result => (result.kind === 'clarify' ? result : { ...result, ...baseResult }));
    }

    if (isClosedVoteQuestion) {
      const responseBuilder = buildClosedVoteResponseInternal(question, route.scope, depute, filteredVotes, {
        deputeQueryMatches,
        globalQueryMatches
      }, deps);
      return {
        kind: 'response',
        message: responseBuilder.message,
        voteIds: filteredVotes.map(deps.getVoteId),
        displayedVoteIds: (responseBuilder.displayedVotes || []).map(deps.getVoteId),
        summaryText: responseBuilder.summaryText || null,
        referencePresentation: responseBuilder.referencePresentation || null,
        inlineVoteMode: responseBuilder.inlineVoteMode || null,
        ...baseResult
      };
    }

    if (filteredVotes.length === 0) {
      return {
        kind: 'response',
        message: buildNoResultMessageInternal(route.scope, route.intent, { deputeQueryMatches, globalQueryMatches }, deps),
        voteIds: [],
        ...baseResult
      };
    }

    if (route.intent.kind === 'count') {
      return {
        kind: 'response',
        message: buildCountResponseInternal(filteredVotes, route.scope, depute, deps),
        voteIds: filteredVotes.map(deps.getVoteId),
        ...baseResult
      };
    }

    if (route.intent.kind === 'scrutiny_detail') {
      const responseBuilder = buildScrutinyDetailResponseInternal(filteredVotes, question, deps);
      return {
        kind: 'response',
        message: responseBuilder.message,
        voteIds: filteredVotes.map(deps.getVoteId),
        displayedVoteIds: (responseBuilder.displayedVotes || filteredVotes).map(deps.getVoteId),
        summaryText: responseBuilder.summaryText || null,
        referencePresentation: responseBuilder.referencePresentation || null,
        inlineVoteMode: responseBuilder.inlineVoteMode || null,
        ...baseResult,
        limit: route.scope.filters.limit || deps.defaultChatListLimit
      };
    }

    if (route.intent.kind === 'thematic_stance') {
      // Branche asynchrone : croise les votes « ensemble » avec les fiches de lois.
      return buildThematicStanceResponseInternal(filteredVotes, route.scope, depute, question, deps)
        .then(responseBuilder => ({
          kind: 'response',
          message: responseBuilder.message,
          voteIds: filteredVotes.map(deps.getVoteId),
          displayedVoteIds: (responseBuilder.displayedVotes || []).map(deps.getVoteId),
          summaryText: responseBuilder.summaryText || null,
          referencePresentation: responseBuilder.referencePresentation || null,
          inlineVoteMode: responseBuilder.inlineVoteMode || null,
          ...baseResult,
          limit: route.scope.filters.limit || deps.defaultChatListLimit
        }));
    }

    const responseBuilder = route.intent.kind === 'subjects'
      ? buildSubjectsResponseInternal(filteredVotes, route.scope, depute, question, deps)
      : buildListResponseInternal(filteredVotes, route.scope, depute, deps);

    if (responseBuilder.kind === 'clarify') {
      return {
        kind: 'clarify',
        message: responseBuilder.message,
        clarificationKind: responseBuilder.clarificationKind || null
      };
    }

    return {
      kind: 'response',
      message: responseBuilder.message,
      voteIds: filteredVotes.map(deps.getVoteId),
      displayedVoteIds: (responseBuilder.displayedVotes || filteredVotes).map(deps.getVoteId),
      summaryText: responseBuilder.summaryText || null,
      referencePresentation: responseBuilder.referencePresentation || null,
      inlineVoteMode: responseBuilder.inlineVoteMode || null,
      ...baseResult,
      limit: route.scope.filters.limit || deps.defaultChatListLimit
    };
  };
}
