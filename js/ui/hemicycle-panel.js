const HEMICYCLE_ASSET_PATHS = {
  svg: 'public/data/hemicycle_svg/hemicycle.svg',
  placesMapping: 'public/data/place_mapping/places_mapping.json',
  seatColors: 'public/data/hemicycle_svg/sieges_couleurs.json'
};

function findHemicycleSeatElementInternal(container, seatId) {
  if (!container || !seatId) {
    return null;
  }

  if (String(seatId).toUpperCase() === 'PRESIDENT') {
    return container.querySelector('#ppresident') || container.querySelector('#pPRESIDENT');
  }

  return container.querySelector(`#p${seatId}`);
}

function formatHemicycleCircoInternal(depute) {
  if (!depute?.departementNom || !depute?.circo) {
    return '';
  }

  const circoNum = parseInt(depute.circo, 10);
  const circoFormatted = circoNum === 1 ? '1re' : `${circoNum}e`;
  return `${depute.departementNom} (${circoFormatted} circonscription)`;
}

function buildHemicycleTooltipHtmlInternal(depute, {
  seatNumber,
  groupeNom,
  photoUrl,
  deputePhotoPlaceholderUrl
}) {
  const circoTexte = formatHemicycleCircoInternal(depute);
  let tooltipHTML = `<img src="${photoUrl}" alt="${depute.prenom} ${depute.nom}" class="seat-tooltip-photo" onerror="this.onerror=null;this.src='${deputePhotoPlaceholderUrl}'">`;
  tooltipHTML += `<div class="seat-tooltip-seat">Siege ${seatNumber}</div>`;
  tooltipHTML += `<div class="seat-tooltip-name">${depute.prenom} ${depute.nom}</div>`;
  tooltipHTML += `<div class="seat-tooltip-group">${groupeNom}</div>`;

  if (circoTexte) {
    tooltipHTML += `<div class="seat-tooltip-circo">${circoTexte}</div>`;
  }

  return tooltipHTML;
}

export function createHemicyclePanelController({
  appState,
  getDeputesData,
  getGroupesPolitiques,
  getDeputePhotoUrl,
  deputePhotoPlaceholderUrl,
  escapeHtml,
  selectDepute
}) {
  let hemicycleActiveSeatElement = null;
  let hemicyclePlacesMapping = {};

  function getPlacesMapping() {
    return hemicyclePlacesMapping;
  }

  function updateTooltipPosition(event) {
    if (window.seatTooltip && window.seatTooltip.classList.contains('visible')) {
      window.seatTooltip.style.left = `${event.clientX + 12}px`;
      window.seatTooltip.style.top = `${event.clientY + 12}px`;
    }
  }

  function updateHemicycleSyncStatus(mappedSeats = 0) {
    const statusEl = document.getElementById('hemicycle-sync-status');
    if (!statusEl) {
      return;
    }

    const updatedOn = getDeputesData().reduce((latest, depute) => {
      const current = String(depute?.dateMaj || '');
      return current > latest ? current : latest;
    }, '');
    const dateLabel = updatedOn || new Date().toISOString().slice(0, 10);
    statusEl.textContent = `Hemicycle officiel charge (${mappedSeats} sieges) - reference ${dateLabel}.`;
  }

  function deactivateSeatElement(element) {
    if (!element) {
      return;
    }

    element.classList.remove('seat-active');
    element.style.outline = 'none';

    if (!element.matches(':hover')) {
      element.style.stroke = 'none';
      element.style.strokeWidth = '0';
    }

    if (document.activeElement === element && typeof element.blur === 'function') {
      element.blur();
    }
  }

  function activateSeatElement(element) {
    if (!element) {
      clearActiveSeat();
      return;
    }

    if (hemicycleActiveSeatElement && hemicycleActiveSeatElement !== element) {
      deactivateSeatElement(hemicycleActiveSeatElement);
    }

    hemicycleActiveSeatElement = element;
    hemicycleActiveSeatElement.classList.add('seat-active');
    hemicycleActiveSeatElement.style.outline = 'none';

    if (typeof hemicycleActiveSeatElement.blur === 'function') {
      const activeSeatElement = hemicycleActiveSeatElement;
      queueMicrotask(() => activeSeatElement?.blur());
    }
  }

  function clearActiveSeat() {
    if (hemicycleActiveSeatElement) {
      deactivateSeatElement(hemicycleActiveSeatElement);
      hemicycleActiveSeatElement = null;
    }
  }

  function setActiveSeatByDepute(depute) {
    const container = document.getElementById('hemicycle-container');
    if (!container || !depute || !hemicyclePlacesMapping) {
      clearActiveSeat();
      return;
    }

    const seatIdRaw = hemicyclePlacesMapping[depute.id];
    if (!seatIdRaw) {
      clearActiveSeat();
      return;
    }

    const seatElement = findHemicycleSeatElementInternal(container, String(seatIdRaw));
    if (!seatElement) {
      clearActiveSeat();
      return;
    }

    activateSeatElement(seatElement);
  }

  function applySeatStyle(element, depute, forcedColor = null) {
    let finalColor = '#bdc3c7';

    if (forcedColor) {
      finalColor = forcedColor;
    } else {
      const groupeInfo = getGroupesPolitiques().find(groupe => groupe.code === depute.groupeAbrev);
      if (groupeInfo) {
        finalColor = groupeInfo.couleur;
      }
    }

    element.style.fill = finalColor;
    element.style.cursor = 'pointer';
    element.style.pointerEvents = 'all';
    element.style.transition = 'all 0.15s ease';
    element.style.outline = 'none';
    element.setAttribute('tabindex', '-1');
    element.setAttribute('focusable', 'false');

    const title = document.createElement('title');
    title.textContent = `${depute.prenom} ${depute.nom} (${depute.groupeAbrev})`;
    element.innerHTML = '';
    element.appendChild(title);

    element.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      activateSeatElement(element);
      selectDepute(depute);
    };

    const seatNumber = element.id ? element.id.substring(1) : '?';

    element.onmouseenter = function () {
      this.style.opacity = '0.7';
      this.style.stroke = '#333';
      this.style.strokeWidth = '1px';

      if (!window.seatTooltip) {
        window.seatTooltip = document.createElement('div');
        window.seatTooltip.className = 'seat-tooltip';
        document.body.appendChild(window.seatTooltip);
      }

      const photoUrl = getDeputePhotoUrl(depute);
      const groupeInfo = getGroupesPolitiques().find(groupe => groupe.code === depute.groupeAbrev);
      const groupeNom = groupeInfo ? groupeInfo.nom : depute.groupeAbrev;

      window.seatTooltip.innerHTML = buildHemicycleTooltipHtmlInternal(depute, {
        seatNumber,
        groupeNom,
        photoUrl,
        deputePhotoPlaceholderUrl
      });
      window.seatTooltip.classList.add('visible');
      document.addEventListener('mousemove', updateTooltipPosition);
    };

    element.onmouseleave = function () {
      this.style.opacity = '1';
      if (!this.classList.contains('seat-active')) {
        this.style.stroke = 'none';
        this.style.strokeWidth = '0';
      }

      if (window.seatTooltip) {
        window.seatTooltip.classList.remove('visible');
      }

      document.removeEventListener('mousemove', updateTooltipPosition);
    };
  }

  async function setupHemicycle() {
    const container = document.getElementById('hemicycle-container');

    try {
      const [responseSvg, responseMapping, responseColors] = await Promise.all([
        fetch(HEMICYCLE_ASSET_PATHS.svg),
        fetch(HEMICYCLE_ASSET_PATHS.placesMapping),
        fetch(HEMICYCLE_ASSET_PATHS.seatColors)
      ]);

      if (!responseSvg.ok) {
        throw new Error('SVG introuvable');
      }

      const svgText = await responseSvg.text();
      container.innerHTML = svgText;

      const svgElement = container.querySelector('svg');
      if (svgElement) {
        svgElement.style.width = '100%';
        svgElement.style.height = 'auto';
        svgElement.style.maxWidth = '100%';
        svgElement.style.display = 'block';
        svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgElement.removeAttribute('width');
        svgElement.removeAttribute('height');
      }

      hemicyclePlacesMapping = responseMapping.ok ? await responseMapping.json() : {};
      const seatColors = responseColors.ok ? await responseColors.json() : {};

      getDeputesData().forEach(depute => {
        const seatId = hemicyclePlacesMapping[depute.id];
        if (!seatId) {
          return;
        }

        const seatElement = findHemicycleSeatElementInternal(container, seatId);
        if (!seatElement) {
          return;
        }

        const forcedColor = seatColors[seatId] || seatColors[String(seatId).toLowerCase()] || null;
        applySeatStyle(seatElement, depute, forcedColor);
      });

      updateHemicycleSyncStatus(Object.keys(hemicyclePlacesMapping).length);
      setActiveSeatByDepute(appState.currentDepute);
    } catch (error) {
      console.error('Erreur hemicycle :', error);
      container.innerHTML = `<div style="text-align:center; color:#666; padding:20px;">Hemicycle indisponible<br><small>${escapeHtml(error.message)}</small></div>`;
    }
  }

  function selectRandomDepute(groupeCode) {
    const deputes = getDeputesData().filter(depute => depute.groupe === groupeCode);
    if (!deputes.length) {
      return;
    }

    const depute = deputes[Math.floor(Math.random() * deputes.length)];
    selectDepute(depute);
  }

  function renderLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '';

    getGroupesPolitiques().forEach(groupe => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <div class="legend-color" style="background-color:${groupe.couleur}"></div>
        <span>${groupe.nom} (${groupe.seats})</span>
      `;
      item.addEventListener('click', () => selectRandomDepute(groupe.code));
      legend.appendChild(item);
    });
  }

  return {
    getPlacesMapping,
    setActiveSeatByDepute,
    setupHemicycle,
    renderLegend
  };
}
