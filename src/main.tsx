import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeStorage } from './lib/storage';

const root = createRoot(document.getElementById('root')!);

initializeStorage().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
