export type Locale = 'ko' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['ko', 'en'];

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * Parse Accept-Language header or locale string into a supported Locale.
 * Falls back to the provided default.
 */
export function parseLocale(raw: string | undefined | null, fallback: Locale = 'en'): Locale {
  if (!raw) return fallback;

  // Direct match: "ko", "en"
  const lower = raw.toLowerCase().trim();
  if (isLocale(lower)) return lower;

  // Accept-Language header: "ko-KR,ko;q=0.9,en;q=0.8"
  const tags = lower.split(',').map(t => t.split(';')[0].trim());
  for (const tag of tags) {
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('en')) return 'en';
  }

  return fallback;
}
