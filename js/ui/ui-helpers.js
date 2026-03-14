export function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function formatCirco(num) {
  if (!num) {
    return '';
  }

  const parsed = parseInt(num, 10);
  if (isNaN(parsed)) {
    return num;
  }

  return parsed === 1 ? '1re circonscription' : `${parsed}e circonscription`;
}

function getDeputeMatriculeInternal(depute) {
  return String(depute?.id || '').replace(/^PA/, '').trim();
}

export function createUiHelpers({
  deputePhotosDir,
  deputePhotoPlaceholderUrl
}) {
  function getDeputePhotoUrl(depute) {
    const matricule = getDeputeMatriculeInternal(depute);
    return matricule ? `${deputePhotosDir}/${matricule}.jpg` : deputePhotoPlaceholderUrl;
  }

  return {
    getDeputePhotoUrl
  };
}
