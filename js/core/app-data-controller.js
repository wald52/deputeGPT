export function createAppDataController({
  fetchModelCatalog,
  fallbackCatalog,
  setModelCatalog,
  setModelsConfig,
  populateModelSelect,
  fetchDeputesData,
  setDeputesData,
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
