import { normalizeQuestion } from '../domain/vote-normalizer.js';

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
  const SEARCH_RESULT_LIMIT = 10;

  function setupSearch() {
    const input = document.getElementById('search-input');
    const resultsList = document.getElementById('search-results');
    const searchStatus = document.getElementById('search-status');

    if (!input || !resultsList) {
      return;
    }

    const setStatus = message => {
      if (searchStatus) {
        searchStatus.textContent = message || '';
      }
    };

    const setResultsVisibility = visible => {
      const isVisible = Boolean(visible);
      resultsList.hidden = !isVisible;
    };

    const clearResults = ({ clearStatus = false } = {}) => {
      resultsList.innerHTML = '';
      setResultsVisibility(false);
      if (clearStatus) {
        setStatus('');
      }
    };

    const focusResult = direction => {
      const resultButtons = Array.from(resultsList.querySelectorAll('.search-result-button'));
      if (resultButtons.length === 0) {
        return;
      }

      const activeIndex = resultButtons.indexOf(document.activeElement);
      const nextIndex = activeIndex === -1
        ? (direction > 0 ? 0 : resultButtons.length - 1)
        : (activeIndex + direction + resultButtons.length) % resultButtons.length;

      resultButtons[nextIndex]?.focus();
    };

    const handleResultSelection = (depute, fullName) => {
      selectDepute(depute);
      input.value = fullName;
      clearResults();
      setStatus(`Député sélectionné: ${fullName}.`);
    };

    document.addEventListener('click', event => {
      if (!input.contains(event.target) && !resultsList.contains(event.target)) {
        clearResults();
      }
    });

    resultsList.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusResult(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusResult(-1);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearResults();
        input.focus();
      }
    });

    input.addEventListener('input', event => {
      try {
        const query = normalizeQuestion(event.target.value);

        if (query.length < 2) {
          clearResults();
          setStatus(query.length === 0 ? '' : 'Saisissez au moins deux caractères pour lancer la recherche.');
          return;
        }

        if (getDeputesData().length === 0) {
          clearResults();
          setStatus('Chargement de la liste des deputes en cours...');
          return;
        }

        const results = getDeputesData().filter(depute => {
          const nom = normalizeQuestion(depute.nom);
          const prenom = normalizeQuestion(depute.prenom);
          const groupe = normalizeQuestion(depute.groupeNom || depute.groupe);
          const circo = normalizeQuestion(depute.circonscription || depute.departementNom);
          const fullName = `${prenom} ${nom}`;

          return nom.includes(query) ||
            prenom.includes(query) ||
            fullName.includes(query) ||
            groupe.includes(query) ||
            circo.includes(query);
        });

        resultsList.innerHTML = '';

        if (results.length === 0) {
          const emptyItem = document.createElement('li');
          emptyItem.className = 'search-result-item search-result-empty';
          emptyItem.textContent = 'Aucun résultat';
          resultsList.appendChild(emptyItem);
          setResultsVisibility(true);
          setStatus('Aucun député ne correspond à cette recherche.');
          return;
        }

        const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);
        const fragment = document.createDocumentFragment();

        visibleResults.forEach(depute => {
          const item = document.createElement('li');
          item.className = 'search-result-item';

          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'search-result-button';

          const fullName = `${depute.prenom} ${depute.nom}`;
          let circoDisplay = depute.circonscription;

          if (depute.departementNom && depute.circo) {
            circoDisplay = `${depute.departementNom} (${formatCirco(depute.circo)})`;
          } else if (!circoDisplay && depute.departementNom) {
            circoDisplay = `${depute.departementNom} ${depute.circo ? `(${depute.circo})` : ''}`;
          }

          const groupeDisplay = depute.groupeNom || depute.groupe || '';
          action.innerHTML = buildSearchResultHtmlInternal(depute, {
            fullName,
            circoDisplay,
            groupeDisplay,
            getDeputePhotoUrl,
            deputePhotoPlaceholderUrl
          });
          action.setAttribute('aria-label', `${fullName}, ${groupeDisplay}${circoDisplay ? `, ${circoDisplay}` : ''}`);
          action.addEventListener('click', () => {
            handleResultSelection(depute, fullName);
          });

          item.appendChild(action);
          fragment.appendChild(item);
        });

        resultsList.appendChild(fragment);
        setResultsVisibility(true);
        setStatus(
          visibleResults.length < results.length
            ? `${results.length} resultats trouves. Affichage limite aux ${visibleResults.length} premiers.`
            : `${results.length} résultat${results.length > 1 ? 's' : ''} disponible${results.length > 1 ? 's' : ''}.`
        );
      } catch (error) {
        console.error(error);
      }
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        clearResults();
        return;
      }

      if (event.key === 'ArrowDown' && !resultsList.hidden) {
        event.preventDefault();
        focusResult(1);
      }
    });
  }

  return {
    setupSearch
  };
}
