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

const localeModules = import.meta.glob<{ default: Record<string, unknown> }>(
  '../locales/*.json'
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

export async function loadLocaleMessages(
  instance: I18n,
  locale: SupportedLocale
): Promise<void> {
  if (loadedLocales.has(locale)) {
    await nextTick();
    return;
  }

  const path = `../locales/${locale}.json`;
  const loader = localeModules[path];
  if (!loader) {
    throw new Error(`Missing locale bundle for "${locale}" (${path})`);
  }

  const mod = await loader();
  instance.global.setLocaleMessage(locale, mod.default);
  loadedLocales.add(locale);
  await nextTick();
}

export default i18n;
