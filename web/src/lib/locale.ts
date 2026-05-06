import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '@/i18n/locale-options';

export const LOCALE_STORAGE_KEY = 'ttt-locale';

export function getStoredLocale(): SupportedLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) return null;
    return isSupportedLocale(raw) ? raw : null;
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
