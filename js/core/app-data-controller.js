export function createAppDataController({
  fetchModelCatalog,
  fallbackCatalog,
  setModelCatalog,
  setModelsConfig,
  populateModelSelect,
  fetchDeputesData,
  ensureDeputesDetailsReady: fetchDeputesDetailsReady,
  setDeputesData,
  setDeputesDataDetailLevel,
  setDeputesLatest,
  fetchGroupesData,
  setGroupesPolitiques,
  searchIndexRepository
}) {
  async function loadModelCatalog() {
    const result = await fetchModelCatalog({
      fallbackCatalog
    });
    setModelCatalog(result.modelCatalog);
    setModelsConfig(result.modelsConfig);
    populateModelSelect();
  }

  async function loadDeputesData() {
    const result = await fetchDeputesData();
    setDeputesData(result.deputesData);
    setDeputesDataDetailLevel?.(result.detailLevel || 'boot');
    setDeputesLatest?.(result.latest || null);
    return result;
  }

  async function ensureDeputesDetailsReady() {
    const result = await fetchDeputesDetailsReady();
    setDeputesData(result.deputesData);
    setDeputesDataDetailLevel?.(result.detailLevel || 'full');
    setDeputesLatest?.(result.latest || null);
    return result;
  }

  async function loadGroupesData() {
    setGroupesPolitiques(await fetchGroupesData());
  }

  async function loadSearchIndex() {
    return searchIndexRepository.loadSearchIndex();
  }

  async function ensureSearchIndexReady() {
    return searchIndexRepository.ensureSearchIndexReady();
  }

  async function ensureSemanticIndexReady(mode = 'single_vector') {
    return searchIndexRepository.ensureSemanticIndexReady(mode);
  }

  async function getSemanticSearchConfig(mode = 'single_vector') {
    return searchIndexRepository.getSemanticSearchConfig(mode);
  }

  async function getSemanticSearchModes() {
    return searchIndexRepository.getSemanticSearchModes();
  }

  function scheduleSearchIndexWarmup() {
    searchIndexRepository.scheduleSearchIndexWarmup();
  }

  return {
    ensureDeputesDetailsReady,
    ensureSearchIndexReady,
    ensureSemanticIndexReady,
    getSemanticSearchConfig,
    getSemanticSearchModes,
    loadDeputesData,
    loadGroupesData,
    loadModelCatalog,
    loadSearchIndex,
    scheduleSearchIndexWarmup
  };
}
