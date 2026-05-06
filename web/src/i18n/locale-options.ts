export const DEFAULT_LOCALE = 'en-US' as const;

/**
 * UI languages: tags match folder names under `src/locales/<tag>/` (BCP 47, regional where applicable).
 * Each folder holds partial message files (e.g. `global.json`, `settings.json`) merged at runtime.
 */
export const LOCALE_OPTIONS = [
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'tr-TR', label: 'Türkçe', flag: '🇹🇷' },
] as const;

export type SupportedLocale = (typeof LOCALE_OPTIONS)[number]['code'];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return LOCALE_OPTIONS.some((o) => o.code === value);
}

export function localeLabel(code: SupportedLocale): string {
  const opt = LOCALE_OPTIONS.find((o) => o.code === code);
  return opt?.label ?? code;
}

export function localeFlag(code: SupportedLocale): string {
  const opt = LOCALE_OPTIONS.find((o) => o.code === code);
  return opt?.flag ?? '🏳️';
}
