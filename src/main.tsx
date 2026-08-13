import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {LanguageProvider} from './i18n/LanguageContext';
import {ThemeProvider} from './context/ThemeContext';
import {installAirgapNetworkPolicy} from './lib/airgapNetworkPolicy';

function revealNativeWindowAfterFirstPaint(): void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

  requestAnimationFrame(() => {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().show())
      .catch(() => {
        // Keep the web UI usable if the native window bridge is unavailable.
      });
  });
}

if (import.meta.env.PROD) {
  installAirgapNetworkPolicy();
}

const root = createRoot(document.getElementById('root')!);

requestAnimationFrame(() => {
  revealNativeWindowAfterFirstPaint();

  void import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <LanguageProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </LanguageProvider>
      </StrictMode>,
    );
  });
});
