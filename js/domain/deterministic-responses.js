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
    let message = `Oui. ${deputeLabel} a ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''}`;
    if (targetDescription) {
      message += ` ${targetDescription}`;
    }
    message += '.';

    if (displayedVotes.length > 0) {
      message += '\n';
      if (displayedVotes.length < filteredVotes.length) {
        message += `J'en affiche ${displayedVotes.length}, tries par date.\n`;
      }
      message += displayedVotes.map(vote => deps.formatVoteLine(vote, 'list')).join('\n');
    }

    return {
      kind: 'response',
      message,
      displayedVotes
    };
  }

  if (scope.filters.queryText) {
    let message = `Non. Je ne trouve aucun vote ${deps.describeQueryVotePhrase(scope.filters, phrasingContext)} enregistre pour ${deputeLabel} sur cette legislature.`;

    if (scope.filters.vote && deputeQueryMatches.length > 0) {
      const distributionText = formatVoteDistributionInternal(buildVoteDistributionInternal(deputeQueryMatches));
      message += ` En revanche, je trouve ${deputeQueryMatches.length} scrutin${deputeQueryMatches.length > 1 ? 's' : ''} correspondant${deputeQueryMatches.length > 1 ? 's' : ''} pour ce depute`;
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
      message += ` Je trouve toutefois ${globalQueryMatches.length} scrutin${globalQueryMatches.length > 1 ? 's' : ''} correspondant${globalQueryMatches.length > 1 ? 's' : ''} dans la base de cette legislature. Il est donc possible que ce depute n'ait pas pris part au vote ou qu'aucun vote ne soit enregistre pour lui sur ce${globalQueryMatches.length > 1 ? 's' : ''} scrutin${globalQueryMatches.length > 1 ? 's' : ''}.`;
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
    return 'Je ne trouve aucun vote correspondant a ce filtre.';
  }

  const { deputeQueryMatches = [], globalQueryMatches = [] } = context;
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, context);
  if (queryDescription && !dateDescription) {
    let message = `Je ne trouve aucun vote ${deps.describeQueryVotePhrase(scope.filters, context)} sur cette legislature.`;

    if (scope.filters.vote && deputeQueryMatches.length > 0) {
      return `${message} En revanche, je trouve ${deputeQueryMatches.length} scrutin${deputeQueryMatches.length > 1 ? 's' : ''} correspondant${deputeQueryMatches.length > 1 ? 's' : ''} pour ce depute, mais pas avec ce sens de vote.`;
    }

    if (globalQueryMatches.length > 0) {
      message += ` Je trouve toutefois ${globalQueryMatches.length} scrutin${globalQueryMatches.length > 1 ? 's' : ''} correspondant${globalQueryMatches.length > 1 ? 's' : ''} dans la base de cette legislature. Il est donc possible que ce depute n'ait pas pris part au vote ou qu'aucun vote ne soit enregistre pour lui sur ce${globalQueryMatches.length > 1 ? 's' : ''} scrutin${globalQueryMatches.length > 1 ? 's' : ''}.`;
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
    message += ` sur le theme "${scope.filters.theme}"`;
  }
  if (dateDescription) {
    if (dateDescription.startsWith('le ')) {
      message += ` a la date du ${dateDescription.slice(3)}`;
    } else {
      message += ` ${dateDescription}`;
    }
  }

  return message === 'Je ne trouve aucun vote correspondant'
    ? 'Je ne trouve aucun vote correspondant a votre demande.'
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
    filterBits.push(`sur le theme "${scope.filters.theme}"`);
  }

  if (dateDescription) {
    filterBits.push(dateDescription);
  }

  const total = filteredVotes.length;
  return `${depute.prenom} ${depute.nom} a ${total} ${filterBits.join(' ')}.`;
}

function buildListResponseInternal(filteredVotes, scope, depute, deps) {
  if (deps.shouldClarifyLargeList(scope, { kind: 'list' }, filteredVotes.length)) {
    return {
      kind: 'clarify',
      message: deps.buildLargeListClarification(filteredVotes.length)
    };
  }

  const requestedLimit = scope.filters.limit || deps.defaultChatListLimit;
  const displayedVotes = filteredVotes.slice(0, requestedLimit);
  const dateDescription = deps.describeDateFilter(scope.filters);
  const queryDescription = deps.describeQueryFilter(scope.filters, { filteredVotes, displayedVotes });
  const introParts = [`${depute.prenom} ${depute.nom} a ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''} correspondant${filteredVotes.length > 1 ? 's' : ''}`];

  if (queryDescription) {
    introParts.push(`pour ${queryDescription}`);
  }

  if (scope.filters.theme) {
    introParts.push(`au theme "${scope.filters.theme}"`);
  }

  if (scope.filters.vote) {
    introParts.push(`avec le vote "${scope.filters.vote}"`);
  }

  if (dateDescription) {
    introParts.push(dateDescription);
  }

  let message = `${introParts.join(' ')}.\n`;
  if (displayedVotes.length < filteredVotes.length) {
    message += `J'en affiche ${displayedVotes.length}, tries par date.\n`;
  }

  message += displayedVotes.map(vote => deps.formatVoteLine(vote, 'list')).join('\n');

  return {
    kind: 'response',
    message,
    displayedVotes
  };
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

  let message = `Themes principaux parmi les ${filteredVotes.length} votes retenus pour ${depute.prenom} ${depute.nom} :`;

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
  if (deps.shouldClarifyLargeList(scope, { kind: 'subjects' }, filteredVotes.length)) {
    return {
      kind: 'clarify',
      message: deps.buildLargeListClarification(filteredVotes.length)
    };
  }

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
  let message = `Voici les sujets des ${displayedVotes.length} vote${displayedVotes.length > 1 ? 's' : ''} retenu${displayedVotes.length > 1 ? 's' : ''} pour ${depute.prenom} ${depute.nom}`;

  if (queryDescription) {
    message += ` pour ${queryDescription}`;
  }

  if (dateDescription) {
    message += ` ${dateDescription}`;
  }

  if (filteredVotes.length > displayedVotes.length) {
    message += ` (sur ${filteredVotes.length} correspondances)`;
  }

  message += ' :\n';
  message += displayedVotes.map(vote => deps.formatVoteLine(vote, 'subjects')).join('\n');

  return {
    kind: 'response',
    message,
    displayedVotes
  };
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
    return isoDate || 'date non renseignee';
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
    parts.push(`${deputeLabel} a un score de participation global de ${formatPercentInternal(overallScore)} aux scrutins publics de cette legislature.`);
  }

  if (Number.isFinite(specialtyScore)) {
    parts.push(`Son score de participation de specialite est de ${formatPercentInternal(specialtyScore)}.`);
  } else if (wantsSpecialty) {
    parts.push('Je n ai pas de score de participation de specialite exploitable dans les donnees chargees.');
  }

  if (!parts.length) {
    return {
      kind: 'response',
      message: `Je n ai pas de score de participation exploitable pour ${deputeLabel} dans les donnees publiques chargees.`
    };
  }

  if (/\b(hebdomadaire|seance pleniere|séance plénière|heure|jour)\b/.test(normalizedQuestion)) {
    parts.push('Je ne dispose pas d une frequence par semaine ou par seance dans les donnees publiques chargees.');
  } else if (/\b(absent|absence)\b/.test(normalizedQuestion) && Number.isFinite(overallScore)) {
    parts.push(`Cela correspond a une participation ${overallScore >= 0.6 ? 'plutot reguliere' : overallScore >= 0.35 ? 'mitigee' : 'plutot faible'} sur les scrutins publics.`);
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
      message: `Je n ai pas de score de loyaute exploitable pour ${deputeLabel} dans les donnees publiques chargees.`
    };
  }

  const normalizedLoyaltyScore = loyaltyScore > 1 ? loyaltyScore / 100 : loyaltyScore;
  const gapScore = Math.max(0, 1 - normalizedLoyaltyScore);
  const loyaltyText = formatPercentInternal(loyaltyScore);
  const gapText = formatPercentInternal(gapScore);
  const followsGroup = normalizedLoyaltyScore >= 0.75;
  const responseParts = route.intent.kind === 'group_gap'
    ? [`${deputeLabel} a un score de loyaute de ${loyaltyText} avec le groupe ${groupLabel}. Cela suggere un ecart global indicatif d environ ${gapText} par rapport a la ligne du groupe.`]
    : [`${deputeLabel} a un score de loyaute de ${loyaltyText} avec le groupe ${groupLabel}. Cela suggere qu il ${followsGroup ? 'suit plutot souvent' : 'suit de facon plus variable'} la ligne de son groupe.`];

  if (/\b(circonscription|electorat|electeurs)\b/.test(normalizedQuestion)) {
    responseParts.push('Je peux mesurer l alignement global au groupe, pas l effet direct de la circonscription dans ces donnees.');
  }

  responseParts.push('Je n ai pas le detail scrutin par scrutin des consignes ou des ecarts internes du groupe dans les JSON publics charges.');

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
    let message = `Le scrutin ${deps.getVoteId(vote)} a eu lieu le ${formatVoteDateInternal(vote?.date)}.`;

    if (vote?.titre) {
      message += ` Intitule retenu : ${vote.titre}.`;
    }

    if (asksHour) {
      message += ' Je dispose de la date, pas de l heure, dans les donnees publiques chargees.';
    }

    return {
      kind: 'response',
      message,
      displayedVotes
    };
  }

  let message = `Je trouve ${filteredVotes.length} scrutins correspondants. Voici les numeros et dates des ${displayedVotes.length} premiers :\n`;
  message += displayedVotes
    .map(vote => `- scrutin ${deps.getVoteId(vote)} - ${formatVoteDateInternal(vote?.date)} - ${vote?.titre || 'scrutin sans titre'}`)
    .join('\n');

  if (asksHour) {
    message += '\nJe dispose des dates, pas des heures, dans les donnees publiques chargees.';
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

function inferThematicStanceInternal(distribution) {
  const decisiveVotes = distribution.Pour + distribution.Contre + distribution.Abstention;

  if (decisiveVotes < 3) {
    return {
      conclusion: 'Je n ai pas assez de votes sur ce theme pour conclure serieusement.'
    };
  }

  const supportShare = distribution.Pour / decisiveVotes;
  const opposeShare = distribution.Contre / decisiveVotes;
  const abstentionShare = distribution.Abstention / decisiveVotes;
  const gap = Math.abs(distribution.Pour - distribution.Contre);

  if (supportShare >= 0.6 && distribution.Pour >= distribution.Contre + 2) {
    return {
      conclusion: 'Cela suggere une position plutot favorable sur ce theme.'
    };
  }

  if (opposeShare >= 0.6 && distribution.Contre >= distribution.Pour + 2) {
    return {
      conclusion: 'Cela suggere une position plutot opposee sur ce theme.'
    };
  }

  if (abstentionShare >= 0.45 && gap <= 1) {
    return {
      conclusion: 'La position parait difficile a trancher, avec beaucoup d abstentions.'
    };
  }

  if (gap <= 1) {
    return {
      conclusion: 'La position parait partagee plutot que nettement alignee.'
    };
  }

  if (distribution.Pour > distribution.Contre) {
    return {
      conclusion: 'Cela suggere une position plutot favorable, mais sans ligne totalement nette.'
    };
  }

  return {
    conclusion: 'Cela suggere une position plutot reservee, mais sans ligne totalement nette.'
  };
}

function buildThematicStanceResponseInternal(filteredVotes, scope, depute, deps) {
  const distribution = buildVoteDistributionInternal(filteredVotes);
  const examples = filteredVotes.slice(0, deps.thematicStanceExampleLimit);
  const themeLabel = scope.filters.theme || 'ce theme';
  const stance = inferThematicStanceInternal(distribution);
  const distributionText = formatVoteDistributionInternal(distribution);

  let message = `${depute.prenom} ${depute.nom} a ${filteredVotes.length} vote${filteredVotes.length > 1 ? 's' : ''} retenu${filteredVotes.length > 1 ? 's' : ''} sur le theme "${themeLabel}". ${stance.conclusion}`;

  if (distributionText) {
    message += `\nRepere factuel : ${distributionText}.`;
  }

  message += '\nCette synthese repose sur les scrutins classes dans ce theme, pas sur une evaluation generale de toutes ses prises de position.';

  if (examples.length > 0) {
    message += '\n\nExemples recents :\n';
    message += examples.map(vote => deps.formatVoteLine(vote, 'list')).join('\n');
  }

  return {
    kind: 'response',
    message,
    displayedVotes: filteredVotes
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
        ...baseResult,
        limit: route.scope.filters.limit || deps.defaultChatListLimit
      };
    }

    const responseBuilder = route.intent.kind === 'subjects'
      ? buildSubjectsResponseInternal(filteredVotes, route.scope, depute, question, deps)
      : route.intent.kind === 'thematic_stance'
        ? buildThematicStanceResponseInternal(filteredVotes, route.scope, depute, deps)
        : buildListResponseInternal(filteredVotes, route.scope, depute, deps);

    if (responseBuilder.kind === 'clarify') {
      return {
        kind: 'clarify',
        message: responseBuilder.message
      };
    }

    return {
      kind: 'response',
      message: responseBuilder.message,
      voteIds: filteredVotes.map(deps.getVoteId),
      displayedVoteIds: (responseBuilder.displayedVotes || filteredVotes).map(deps.getVoteId),
      ...baseResult,
      limit: route.scope.filters.limit || deps.defaultChatListLimit
    };
  };
}
