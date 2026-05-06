import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '@/i18n/locale-options';

export const LOCALE_STORAGE_KEY = 'ttt-locale';

/** Previous short tags → current BCP 47 filenames (one-time migration from localStorage). */
const LEGACY_LOCALE_MAP: Record<string, SupportedLocale> = {
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  tr: 'tr-TR',
};

export function getStoredLocale(): SupportedLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) return null;
    if (isSupportedLocale(raw)) return raw;
    const mapped = LEGACY_LOCALE_MAP[raw];
    if (mapped) {
      setStoredLocale(mapped);
      return mapped;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / private mode
  }
}

export function resolveInitialLocale(): SupportedLocale {
  return getStoredLocale() ?? DEFAULT_LOCALE;
}
