import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const tauriHost = process.env.TAURI_DEV_HOST;
  const tauriDebug = process.env.TAURI_ENV_DEBUG === 'true' || process.env.TAURI_ENV_DEBUG === '1';
  const isDebugBuild = mode !== 'production' || tauriDebug;

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    cacheDir: process.env.VITE_CACHE_DIR || path.resolve(import.meta.dirname, '.vite'),
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: tauriHost || '127.0.0.1',
      hmr: tauriHost
        ? {
            protocol: 'ws',
            host: tauriHost,
            port: 3001,
          }
        : process.env.DISABLE_HMR !== 'true',
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: ['**/src-tauri/**'],
            },
    },
    build: {
      // safari13: Vite 8 (rolldown/esbuild transpile) cannot lower destructuring to safari13.
      // Tauri v2 requires macOS 10.15+ (Safari 14+); safari15 is a safe modern floor for all
      // non-Windows webviews (WKWebView / webkit2gtk).
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
      minify: isDebugBuild ? false : ('esbuild' as const),
      sourcemap: isDebugBuild,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('argon2-browser')) {
              return 'argon2-vendor';
            }

            if (id.includes('zxcvbn')) {
              return 'zxcvbn-vendor';
            }

            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }

            if (id.includes('lucide-react') || id.includes('lucide')) {
              return 'icons-vendor';
            }

            if (id.includes('@tauri-apps')) {
              return 'tauri-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
    esbuild: isDebugBuild
      ? undefined
      : {
          drop: ['console', 'debugger'],
        },
  };
});
