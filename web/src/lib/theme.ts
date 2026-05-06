/**
 * Keep storage key and resolution rules in sync with the inline script in index.html.
 * No stored value (or invalid) → follow system `prefers-color-scheme`.
 */
export const THEME_STORAGE_KEY = 'ttt-theme';

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

export function applyThemeClass(): void {
  document.documentElement.classList.toggle('dark', resolvedPrefersDark());
}

export function setStoredTheme(dark: boolean): void {
  localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
  applyThemeClass();
}
