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

