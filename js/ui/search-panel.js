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
      <img src="${getDeputePhotoUrl(depute)}" alt="" class="search-result-photo" loading="lazy" onerror="this.onerror=null;this.src='${deputePhotoPlaceholderUrl}'">
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

    // Modèle ARIA combobox : le focus reste sur l'input, l'option active est
    // suivie via aria-activedescendant (pas de déplacement du focus réel).
    let activeOptionIndex = -1;
    let currentResults = [];

    const setStatus = message => {
      if (searchStatus) {
        searchStatus.textContent = message || '';
      }
    };

    const getOptions = () => Array.from(resultsList.querySelectorAll('[role="option"]'));

    const setActiveOption = index => {
      const options = getOptions();
      activeOptionIndex = index;
      options.forEach((option, optionIndex) => {
        option.setAttribute('aria-selected', String(optionIndex === index));
      });

      const activeOption = index >= 0 ? options[index] : null;
      if (activeOption) {
        input.setAttribute('aria-activedescendant', activeOption.id);
        activeOption.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };

    const setResultsVisibility = visible => {
      const isVisible = Boolean(visible);
      resultsList.hidden = !isVisible;
      input.setAttribute('aria-expanded', String(isVisible));
    };

    const clearResults = ({ clearStatus = false } = {}) => {
      resultsList.innerHTML = '';
      currentResults = [];
      activeOptionIndex = -1;
      input.removeAttribute('aria-activedescendant');
      setResultsVisibility(false);
      if (clearStatus) {
        setStatus('');
      }
    };

    const moveActiveOption = direction => {
      const options = getOptions();
      if (options.length === 0) {
        return;
      }

      const nextIndex = activeOptionIndex === -1
        ? (direction > 0 ? 0 : options.length - 1)
        : (activeOptionIndex + direction + options.length) % options.length;

      setActiveOption(nextIndex);
    };

    const handleResultSelection = depute => {
      const fullName = `${depute.prenom} ${depute.nom}`;
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
          setStatus('Chargement de la liste des députés en cours...');
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
        activeOptionIndex = -1;
        input.removeAttribute('aria-activedescendant');

        if (results.length === 0) {
          currentResults = [];
          const emptyItem = document.createElement('li');
          emptyItem.className = 'search-result-item search-result-empty';
          emptyItem.setAttribute('role', 'presentation');
          emptyItem.textContent = 'Aucun résultat';
          resultsList.appendChild(emptyItem);
          setResultsVisibility(true);
          setStatus('Aucun député ne correspond à cette recherche.');
          return;
        }

        const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);
        currentResults = visibleResults;
        const fragment = document.createDocumentFragment();

        visibleResults.forEach((depute, index) => {
          const item = document.createElement('li');
          item.className = 'search-result-item';
          item.setAttribute('role', 'presentation');

          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'search-result-button';
          action.id = `search-option-${index}`;
          action.setAttribute('role', 'option');
          action.setAttribute('aria-selected', 'false');
          action.tabIndex = -1;

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
            handleResultSelection(depute);
          });
          action.addEventListener('mousemove', () => {
            if (activeOptionIndex !== index) {
              setActiveOption(index);
            }
          });

          item.appendChild(action);
          fragment.appendChild(item);
        });

        resultsList.appendChild(fragment);
        setResultsVisibility(true);
        setStatus(
          visibleResults.length < results.length
            ? `${results.length} résultats trouvés. Affichage limité aux ${visibleResults.length} premiers.`
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

      if (resultsList.hidden) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActiveOption(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActiveOption(-1);
        return;
      }

      if (event.key === 'Enter' && activeOptionIndex >= 0 && currentResults[activeOptionIndex]) {
        event.preventDefault();
        handleResultSelection(currentResults[activeOptionIndex]);
      }
    });
  }

  return {
    setupSearch
  };
}
