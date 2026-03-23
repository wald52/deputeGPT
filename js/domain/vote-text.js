import { stripLeadingFrenchArticle } from './vote-title-display.js';

export function createVoteTextHelpers({
  defaultChatListLimit,
  getVoteId,
  lookupVoteSubject,
  lookupVoteThemeLabel,
  lookupVoteSourceUrl
}) {
  function formatVoteLine(vote, mode = 'list', options = {}) {
    const { includeBullet = true } = options;
    const subject = stripLeadingFrenchArticle(lookupVoteSubject(vote));
    const title = stripLeadingFrenchArticle(vote.titre);
    const themeLabel = lookupVoteThemeLabel(vote);
    const suffix = themeLabel ? ` [theme: ${themeLabel}]` : '';
    const prefix = includeBullet ? '- ' : '';

    if (mode === 'subjects') {
      return `${prefix}[${vote.date}] ${subject}${suffix} (${vote.vote})`;
    }

    return `${prefix}[${vote.date}] ${vote.vote} - ${title}${suffix}`;
  }

  function buildInlineVoteItems(votes = [], options = {}) {
    const { mode = 'list' } = options;
    if (!Array.isArray(votes) || votes.length === 0) {
      return [];
    }

    return votes
      .map(vote => {
        const voteId = String(getVoteId?.(vote) || '').trim();
        if (!voteId) {
          return null;
        }

        const title = stripLeadingFrenchArticle(lookupVoteSubject(vote) || vote?.titre || `Scrutin ${voteId}`);
        const themeLabel = lookupVoteThemeLabel(vote);

        return {
          voteId,
          lineText: formatVoteLine(vote, mode, { includeBullet: false }),
          date: vote?.date || '',
          theme: themeLabel && themeLabel !== 'autre' ? themeLabel : '',
          sourceUrl: String(lookupVoteSourceUrl?.(vote) || '').trim(),
          modalTitle: title
        };
      })
      .filter(Boolean);
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
      return {
        message: 'Je n ai pas d autres votes a afficher dans cette serie.',
        summaryText: 'Je n ai pas d autres votes a afficher dans cette serie.'
      };
    }

    const label = mode === 'subjects' ? 'sujets' : 'votes';
    const summaryText = `Suite de la liste: ${label} ${startIndex} a ${endIndex} sur ${total}.`;
    const message = `${summaryText}\n${votes.map(vote => formatVoteLine(vote, mode)).join('\n')}`;

    return {
      message,
      summaryText
    };
  }

  return {
    buildInlineVoteItems,
    buildLargeListClarification,
    buildPaginationContinuationMessage,
    formatVoteLine
  };
}
