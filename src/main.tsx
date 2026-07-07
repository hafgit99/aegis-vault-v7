import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeStorage } from './lib/storage';
import {LanguageProvider} from './i18n/LanguageContext';
import {ThemeProvider} from './context/ThemeContext';
import {installAirgapNetworkPolicy} from './lib/airgapNetworkPolicy';

import {initializeTauriWindowCloseListener} from './lib/vaultSession';

if (import.meta.env.PROD) {
  installAirgapNetworkPolicy();
}

initializeTauriWindowCloseListener();

const root = createRoot(document.getElementById('root')!);

initializeStorage().finally(() => {
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
