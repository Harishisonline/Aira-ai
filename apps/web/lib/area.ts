/** URL slug helpers. Live stations store Title Case city/place, URLs use lowercase slugs. */

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[ _]+/g, '-');
}

export function unslug(value: string): string {
  return decodeURIComponent(value)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function areaPath(state: string, city: string, place: string): string {
  return `/${slugify(state)}/${slugify(city)}/${slugify(place)}`;
}

/** Where a signed-in user should land. New accounts still pick an area. */
export function homeForProfile(profile: {
  default_state?: string | null;
  default_city?: string | null;
  default_place?: string | null;
} | null): string {
  if (profile?.default_state && profile.default_city && profile.default_place) {
    return areaPath(profile.default_state, profile.default_city, profile.default_place);
  }
  return '/onboarding/area';
}
