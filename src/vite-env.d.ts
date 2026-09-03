/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}


