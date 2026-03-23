const LEADING_FRENCH_ARTICLE_PATTERN = /^(?:(?:de\s+l['’]|de\s+la|des|du|l['’]|le|la|les|un|une)\s*)/iu;

export function stripLeadingFrenchArticle(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const withoutArticle = text.replace(LEADING_FRENCH_ARTICLE_PATTERN, '').trim() || text;
  const withoutTrailingPeriod = withoutArticle.replace(/[.]+$/u, '').trim() || withoutArticle;
  const firstCharacter = withoutTrailingPeriod.charAt(0);

  if (!firstCharacter) {
    return withoutTrailingPeriod;
  }

  return `${firstCharacter.toLocaleUpperCase('fr-FR')}${withoutTrailingPeriod.slice(1)}`;
}
