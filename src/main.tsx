import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {LanguageProvider} from './i18n/LanguageContext';
import {ThemeProvider} from './context/ThemeContext';
import {installAirgapNetworkPolicy} from './lib/airgapNetworkPolicy';

if (import.meta.env.PROD) {
  installAirgapNetworkPolicy();
}

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
);

// Close Tauri native splashscreen and show main window after React mounts
if (window.__TAURI_INTERNALS__) {
  (async () => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const mainWindow = await WebviewWindow.getByLabel('main');
      const splashWindow = await WebviewWindow.getByLabel('splashscreen');

      if (mainWindow) {
        await mainWindow.show();
        await mainWindow.setFocus();
      }
      if (splashWindow) {
        await splashWindow.close();
      }
    } catch (err) {
      console.warn('[Splashscreen] WebviewWindow approach failed, trying Window API:', err);
      try {
        const { Window } = await import('@tauri-apps/api/window');
        const mainWindow = await Window.getByLabel('main');
        const splashWindow = await Window.getByLabel('splashscreen');

        if (mainWindow) {
          await mainWindow.show();
          await mainWindow.setFocus();
        }
        if (splashWindow) {
          await splashWindow.close();
        }
      } catch (fallbackErr) {
        console.error('[Splashscreen] Failed to manage windows:', fallbackErr);
      }
    }
  })();
}
