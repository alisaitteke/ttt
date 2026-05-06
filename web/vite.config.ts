import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const rootPackagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const rootPackageVersion =
  JSON.parse(readFileSync(rootPackagePath, 'utf-8')).version ?? '0.0.0';

export default defineConfig({
  define: {
    'import.meta.env.VITE_TTT_NPM_VERSION': JSON.stringify(rootPackageVersion),
  },
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
