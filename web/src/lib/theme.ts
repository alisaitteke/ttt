/**
 * Keep storage key and resolution rules in sync with the inline script in index.html.
 * No stored value (or invalid) → follow system `prefers-color-scheme`.
 */
export const THEME_STORAGE_KEY = 'ttt-theme';

export type ThemePreference = 'system' | 'light' | 'dark';

let schemeListenerAttached = false;

function resolvedPrefersDark(): boolean {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light') return false;
  if (stored === 'dark') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isFollowingSystemTheme(): boolean {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored !== 'light' && stored !== 'dark';
}

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light') return 'light';
  if (stored === 'dark') return 'dark';
  return 'system';
}

export function applyThemeClass(): void {
  document.documentElement.classList.toggle('dark', resolvedPrefersDark());
}

export function setThemePreference(pref: ThemePreference): void {
  if (pref === 'system') {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  }
  applyThemeClass();
}

/** Apply theme when OS scheme changes while preference is system (call once at app startup). */
export function attachThemeSchemeListener(): void {
  if (typeof window === 'undefined' || schemeListenerAttached) return;
  schemeListenerAttached = true;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (isFollowingSystemTheme()) applyThemeClass();
  });
}
