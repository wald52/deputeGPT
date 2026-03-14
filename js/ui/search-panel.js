function buildSearchResultHtmlInternal(depute, {
  fullName,
  circoDisplay,
  groupeDisplay,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl
}) {
  return `
    <div class="search-result-content">
      <img src="${getDeputePhotoUrl(depute)}" alt="Portrait de ${fullName}" class="search-result-photo" onerror="this.onerror=null;this.src='${deputePhotoPlaceholderUrl}'">
      <div class="search-result-body">
        <div class="search-result-name">${fullName}</div>
        <div class="search-result-info">
          <span>${groupeDisplay}</span>
          <span>${circoDisplay || ''}</span>
        </div>
      </div>
    </div>
  `;
}

export function createSearchPanelController({
  getDeputesData,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl,
  formatCirco,
  selectDepute
}) {
  function setupSearch() {
    const input = document.getElementById('search-input');
    const resultsDiv = document.getElementById('search-results');

    document.addEventListener('click', event => {
      if (!input.contains(event.target) && !resultsDiv.contains(event.target)) {
        resultsDiv.style.display = 'none';
      }
    });

    input.addEventListener('input', event => {
      try {
        const query = event.target.value.trim().toLowerCase();

        if (query.length < 2) {
          resultsDiv.style.display = 'none';
          return;
        }

        const results = getDeputesData().filter(depute => {
          const nom = (depute.nom || '').toLowerCase();
          const prenom = (depute.prenom || '').toLowerCase();
          const groupe = (depute.groupeNom || depute.groupe || '').toLowerCase();
          const circo = (depute.circonscription || depute.departementNom || '').toLowerCase();
          const fullName = `${prenom} ${nom}`;

          return nom.includes(query) ||
            prenom.includes(query) ||
            fullName.includes(query) ||
            groupe.includes(query) ||
            circo.includes(query);
        });

        if (results.length === 0) {
          resultsDiv.innerHTML = '<div class="search-result-item search-result-empty">Aucun resultat</div>';
          resultsDiv.style.display = 'block';
          return;
        }

        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'block';

        results.slice(0, 10).forEach(depute => {
          const item = document.createElement('div');
          item.className = 'search-result-item';

          const fullName = `${depute.prenom} ${depute.nom}`;
          let circoDisplay = depute.circonscription;

          if (depute.departementNom && depute.circo) {
            circoDisplay = `${depute.departementNom} (${formatCirco(depute.circo)})`;
          } else if (!circoDisplay && depute.departementNom) {
            circoDisplay = `${depute.departementNom} ${depute.circo ? `(${depute.circo})` : ''}`;
          }

          const groupeDisplay = depute.groupeNom || depute.groupe || '';
          item.innerHTML = buildSearchResultHtmlInternal(depute, {
            fullName,
            circoDisplay,
            groupeDisplay,
            getDeputePhotoUrl,
            deputePhotoPlaceholderUrl
          });

          item.addEventListener('click', () => {
            selectDepute(depute);
            input.value = fullName;
            resultsDiv.style.display = 'none';
          });

          resultsDiv.appendChild(item);
        });
      } catch (error) {
        console.error(error);
      }
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        resultsDiv.style.display = 'none';
      }
    });
  }

  return {
    setupSearch
  };
}
