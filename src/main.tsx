import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeStorage } from './lib/storage';
import { LanguageProvider } from './i18n/LanguageContext';

const root = createRoot(document.getElementById('root')!);

initializeStorage().finally(() => {
  root.render(
    <StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </StrictMode>,
  );
});
