export function createVoteTextHelpers({
  defaultChatListLimit,
  lookupVoteSubject,
  lookupVoteThemeLabel
}) {
  function formatVoteLine(vote, mode = 'list') {
    const subject = lookupVoteSubject(vote);
    const themeLabel = lookupVoteThemeLabel(vote);
    const suffix = themeLabel ? ` [theme: ${themeLabel}]` : '';

    if (mode === 'subjects') {
      return `- [${vote.date}] ${subject}${suffix} (${vote.vote})`;
    }

    return `- [${vote.date}] ${vote.vote} - ${vote.titre}${suffix}`;
  }

  function buildLargeListClarification(totalMatches) {
    return `La personne selectionnee a ${totalMatches} votes dans ce perimetre. Voulez-vous les ${defaultChatListLimit} plus recents, une periode precise, un type de vote (pour/contre/abstention) ou un theme ?`;
  }

  function buildPaginationContinuationMessage(votes, options = {}) {
    const {
      mode = 'list',
      startIndex = 1,
      endIndex = votes.length,
      total = votes.length
    } = options;

    if (!Array.isArray(votes) || votes.length === 0) {
      return 'Je n ai pas d autres votes a afficher dans cette serie.';
    }

    const label = mode === 'subjects' ? 'sujets' : 'votes';
    let message = `Suite de la liste: ${label} ${startIndex} a ${endIndex} sur ${total}.\n`;
    message += votes.map(vote => formatVoteLine(vote, mode)).join('\n');
    return message;
  }

  return {
    buildLargeListClarification,
    buildPaginationContinuationMessage,
    formatVoteLine
  };
}
