export function formatDownloadSize(sizeMb) {
  if (!Number.isFinite(sizeMb) || sizeMb <= 0) {
    return 'Taille a mesurer';
  }

  if (sizeMb >= 1024) {
    return `~ ${(sizeMb / 1024).toFixed(1)} Go`;
  }

  return `~ ${Math.round(sizeMb)} Mo`;
}

export function formatChatTime(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function truncateAnalysisField(value, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
