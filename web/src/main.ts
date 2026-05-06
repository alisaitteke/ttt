import { createApp } from 'vue';
import latinWoff2 from '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url';
import App from './App.vue';
import i18n, { loadLocaleMessages, setI18nLanguage } from './i18n';
import { resolveInitialLocale } from './lib/locale';
import { attachThemeSchemeListener } from './lib/theme';
import { router } from './router';
import './style.css';

// Self-host only the Latin subset of Source Sans 3 Variable to keep the
// shipped tarball small. Other subsets are intentionally not bundled.
const fontFace = new FontFace(
  'Source Sans 3 Variable',
  `url(${latinWoff2}) format('woff2-variations')`,
  { style: 'normal', weight: '200 900', display: 'swap' }
);
fontFace.load().then((face) => document.fonts.add(face)).catch(() => undefined);

attachThemeSchemeListener();

async function bootstrap(): Promise<void> {
  const initialLocale = resolveInitialLocale();
  await loadLocaleMessages(i18n, initialLocale);
  setI18nLanguage(i18n, initialLocale);

  createApp(App).use(i18n).use(router).mount('#app');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
});
