/**
 * List of all supported survey categories.
 *
 * The categories are shared between the create-survey form
 * and the survey filtering functionality on the home page.
 */
export const SURVEY_CATEGORIES = [
  'Team Activities',
  'Health & Wellness',
  'Gaming & Entertainment',
  'Education & Learning',
  'Lifestyle & Preferences',
  'Technology & Innovation',
] as const;

/**
 * Placeholder text displayed before the user selects a category.
 *
 * This value is also used to detect whether the category
 * field still contains its default state.
 */
export const CATEGORY_PLACEHOLDER_LABEL =
  'Choose category';

/**
 * Maps alternative or legacy category names
 * to the canonical category labels used by the application.
 *
 * Keys are normalized before lookup so differences in spaces,
 * special characters, or casing do not affect matching.
 */
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
 * Creates a normalized lookup key from a category label.
 *
 * The value is converted to lowercase and all characters
 * except letters and numbers are removed.
 *
 * @param value The raw category label to normalize.
 * @returns The normalized lowercase alphanumeric key.
 */
function toCategoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Converts a raw category label to the canonical application label.
 *
 * Known aliases are resolved through the category alias map.
 * Unknown values are returned in trimmed form so custom
 * or unexpected category values remain usable.
 *
 * @param value The raw category label to normalize.
 * @returns The canonical category label when an alias is known,
 * otherwise the trimmed original value.
 */
export function normalizeSurveyCategory(
  value: string,
): string {
  const trimmedValue = value.trim();

  const categoryKey =
    toCategoryKey(trimmedValue);

  const normalizedCategory =
    CATEGORY_ALIASES[categoryKey];

  return normalizedCategory ?? trimmedValue;
}