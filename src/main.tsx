import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './providers/Providers';
import { App } from './App';
import './theme/themes.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>
);
