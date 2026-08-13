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
  import('@tauri-apps/api/webviewWindow').then(async ({ WebviewWindow }) => {
    const mainWindow = await WebviewWindow.getByLabel('main');
    const splashWindow = await WebviewWindow.getByLabel('splashscreen');

    if (mainWindow) {
      await mainWindow.show();
      await mainWindow.setFocus();
    }
    if (splashWindow) {
      await splashWindow.close();
    }
  }).catch(() => {});
}

