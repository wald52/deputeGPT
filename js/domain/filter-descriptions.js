export function createFilterDescriptionHelpers({
  describeQueryVotePhrase
}) {
  function describeDateFilter(filters) {
    const dateFrom = String(filters?.dateFrom || '');
    const dateTo = String(filters?.dateTo || '');
    if (!dateFrom && !dateTo) {
      return '';
    }

    const formatIsoDate = isoDate => {
      const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return isoDate;
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(Date.UTC(year, month - 1, day)));
    };

    const formatIsoMonth = isoDate => {
      const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
      if (!match) {
        return isoDate;
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'UTC',
        month: 'long',
        year: 'numeric'
      }).format(new Date(Date.UTC(year, month - 1, 1)));
    };

    const getIsoParts = isoDate => {
      const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return null;
      }

      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
      };
    };

    const isYearStart = value => /^\d{4}-01-01$/.test(value);
    const isYearEnd = value => /^\d{4}-12-31$/.test(value);
    const fromParts = getIsoParts(dateFrom);
    const toParts = getIsoParts(dateTo);

    if (dateFrom && dateTo && dateFrom === dateTo) {
      return `le ${formatIsoDate(dateFrom)}`;
    }

    if (
      fromParts &&
      toParts &&
      fromParts.year === toParts.year &&
      fromParts.month === toParts.month &&
      fromParts.day === 1 &&
      toParts.day === new Date(Date.UTC(toParts.year, toParts.month, 0)).getUTCDate()
    ) {
      return `en ${formatIsoMonth(dateFrom)}`;
    }

    if (dateFrom && dateTo && isYearStart(dateFrom) && isYearEnd(dateTo)) {
      const fromYear = dateFrom.slice(0, 4);
      const toYear = dateTo.slice(0, 4);
      return fromYear === toYear ? `en ${fromYear}` : `entre ${fromYear} et ${toYear}`;
    }

    if (dateFrom && dateTo) {
      return `entre le ${formatIsoDate(dateFrom)} et le ${formatIsoDate(dateTo)}`;
    }

    if (dateFrom) {
      return isYearStart(dateFrom) ? `depuis ${dateFrom.slice(0, 4)}` : `depuis le ${formatIsoDate(dateFrom)}`;
    }

    return isYearEnd(dateTo) ? `jusqu'en ${dateTo.slice(0, 4)}` : `jusqu'au ${formatIsoDate(dateTo)}`;
  }

  function describeClosedVoteTarget(filters, context = {}) {
    const queryPhrase = describeQueryVotePhrase(filters, context);
    const dateDescription = describeDateFilter(filters);
    const themeDescription = filters?.theme ? `sur le theme "${filters.theme}"` : '';

    if (queryPhrase && dateDescription) {
      return `${queryPhrase} ${dateDescription}`;
    }

    if (queryPhrase) {
      return queryPhrase;
    }

    if (themeDescription && filters?.vote && dateDescription) {
      return `${themeDescription} avec le vote "${filters.vote}" ${dateDescription}`;
    }

    if (themeDescription && filters?.vote) {
      return `${themeDescription} avec le vote "${filters.vote}"`;
    }

    if (themeDescription && dateDescription) {
      return `${themeDescription} ${dateDescription}`;
    }

    if (themeDescription) {
      return themeDescription;
    }

    if (filters?.vote && dateDescription) {
      return `avec le vote "${filters.vote}" ${dateDescription}`;
    }

    if (dateDescription) {
      return dateDescription;
    }

    if (filters?.vote) {
      return `avec le vote "${filters.vote}"`;
    }

    return '';
  }

  return {
    describeClosedVoteTarget,
    describeDateFilter
  };
}
