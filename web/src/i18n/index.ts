import { nextTick } from 'vue';
import type { WritableComputedRef } from 'vue';
import { createI18n } from 'vue-i18n';
import type { I18n } from 'vue-i18n';
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from '@/i18n/locale-options';

export type { SupportedLocale } from '@/i18n/locale-options';
export {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  isSupportedLocale,
  localeFlag,
  localeLabel,
} from '@/i18n/locale-options';

/** All partial JSON files under `locales/<localeTag>/` (e.g. global.json, settings.json). */
const localePartials = import.meta.glob<{ default: Record<string, unknown> }>(
  '../locales/*/*.json'
);

const loadedLocales = new Set<SupportedLocale>();

export const i18n: I18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {},
  globalInjection: true,
});

export function setI18nLanguage(instance: I18n, locale: SupportedLocale): void {
  (instance.global.locale as WritableComputedRef<string>).value = locale;
  document.documentElement.setAttribute('lang', locale);
}

/** Use in non-Vue modules; `i18n.global.t` is typed as an incompatible union call signature. */
export function translateStatic(key: string): string {
  return (i18n.global.t as (k: string, ...args: unknown[]) => string)(key);
}

export async function loadLocaleMessages(
  instance: I18n,
  locale: SupportedLocale
): Promise<void> {
  if (loadedLocales.has(locale)) {
    await nextTick();
    return;
  }

  const segment = `/${locale}/`;
  const entries = Object.entries(localePartials)
    .filter(([path]) => path.includes(segment))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    throw new Error(
      `Missing locale bundles for "${locale}" (expected JSON files under locales/${locale}/)`
    );
  }

  const merged: Record<string, unknown> = {};
  for (const [, loader] of entries) {
    const mod = await loader();
    Object.assign(merged, mod.default);
  }

  instance.global.setLocaleMessage(locale, merged);
  loadedLocales.add(locale);
  await nextTick();
}

export default i18n;
