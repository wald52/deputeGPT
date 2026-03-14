async function fetchJsonDebug(url, fetchOptions = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, fetchOptions);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} sur ${url}. Debut de reponse: ${body.slice(0, 80)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    throw new Error(`Pas du JSON (${contentType}) sur ${url}. Debut: ${body.slice(0, 80)}`);
  }

  return response.json();
}

export async function loadDeputesData({
  latestPath = 'public/data/deputes_actifs/latest.json',
  basePath = 'public/data/deputes_actifs',
  fetchImpl = globalThis.fetch
} = {}) {
  const latest = await fetchJsonDebug(latestPath, { cache: 'no-store' }, fetchImpl);
  const deputesData = await fetchJsonDebug(`${basePath}/${latest.version}.json`, { cache: 'force-cache' }, fetchImpl);
  return {
    latest,
    deputesData
  };
}
