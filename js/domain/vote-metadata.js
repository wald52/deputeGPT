import { ASSEMBLEE_SCRUTIN_URL_BASE } from '../core/config.js';
import { getVoteId, normalizeQuestion } from './vote-normalizer.js';

export function getVoteMetadata(vote, searchIndex) {
  const voteId = getVoteId(vote);
  return searchIndex?.votes?.[voteId] || null;
}

export function getVoteSubject(vote, searchIndex) {
  const metadata = getVoteMetadata(vote, searchIndex);
  return metadata?.subject || metadata?.summary || metadata?.titre || vote?.titre || 'Scrutin sans titre';
}

export function getVoteThemeLabel(vote, searchIndex) {
  const theme = getVoteMetadata(vote, searchIndex)?.theme || getVoteMetadata(vote, searchIndex)?.category || '';
  if (!theme || theme === 'autre') {
    return '';
  }

  return theme;
}

export function getVoteIndexText(vote, searchIndex) {
  const metadata = getVoteMetadata(vote, searchIndex);
  return normalizeQuestion([
    vote?.titre || '',
    metadata?.subject || '',
    metadata?.summary || '',
    metadata?.theme || '',
    metadata?.category || '',
    ...(metadata?.keywords || [])
  ].join(' '));
}

export function getVoteSourceUrl(vote, searchIndex) {
  const metadata = getVoteMetadata(vote, searchIndex);
  if (metadata?.source_url) {
    return metadata.source_url;
  }

  const voteId = getVoteId(vote);
  return /^\d+$/.test(voteId) ? `${ASSEMBLEE_SCRUTIN_URL_BASE}${voteId}` : '';
}
