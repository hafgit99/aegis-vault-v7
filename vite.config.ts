import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const tauriHost = process.env.TAURI_DEV_HOST;

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: tauriHost || '0.0.0.0',
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
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: process.env.TAURI_ENV_DEBUG ? false : ('esbuild' as const),
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
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
  };
});
