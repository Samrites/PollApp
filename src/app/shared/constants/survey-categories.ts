/** Shared category list used by create and home views. */
export const SURVEY_CATEGORIES = [
  'Team Activities',
  'Health & Wellness',
  'Gaming & Entertainment',
  'Education & Learning',
  'Lifestyle & Preferences',
  'Technology & Innovation',
] as const;

/** Placeholder label for the category dropdown before selection. */
export const CATEGORY_PLACEHOLDER_LABEL = 'Choose category';

const CATEGORY_ALIASES: Record<string, string> = {
  teamactivities: 'Team Activities',
  teamactivitys: 'Team Activities',
  healthwellness: 'Health & Wellness',
  healthylifestyle: 'Health & Wellness',
  gamingentertainment: 'Gaming & Entertainment',
  gaming: 'Gaming & Entertainment',
  educationlearning: 'Education & Learning',
  lifestylepreferences: 'Lifestyle & Preferences',
  socialevents: 'Lifestyle & Preferences',
  fooddrinks: 'Lifestyle & Preferences',
  workplaceculture: 'Lifestyle & Preferences',
  technologyinnovation: 'Technology & Innovation',
};

/**
 * Builds a normalized key for category matching.
 * @param value Raw category label.
 * @returns Lowercased alphanumeric key.
 */
function toCategoryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Converts category aliases to one shared canonical label.
 * @param value Raw category label.
 * @returns Canonical category label when known, otherwise trimmed input.
 */
export function normalizeSurveyCategory(value: string): string {
  const trimmed = value.trim();
  const alias = CATEGORY_ALIASES[toCategoryKey(trimmed)];
  return alias ?? trimmed;
}
