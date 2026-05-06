import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const rootPackagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const rootPackageVersion =
  JSON.parse(readFileSync(rootPackagePath, 'utf-8')).version ?? '0.0.0';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    'import.meta.env.VITE_TTT_NPM_VERSION': JSON.stringify(rootPackageVersion),
    __VUE_I18N_LEGACY_API__: false,
    __VUE_I18N_FULL_INSTALL__: false,
  },
  plugins: [
    vue(),
    VueI18nPlugin({
      include: resolve(webRoot, 'src/locales/**'),
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ttt/lib': fileURLToPath(new URL('../src/lib', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        configure: (proxy) => {
          // Rewrite Origin so Hono's loopback-origin guard accepts proxied requests in dev.
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://127.0.0.1:5174');
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
