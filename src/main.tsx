import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './providers/Providers';
import { RegistryProvider } from './registry/RegistryProvider';
import { App } from './App';
import manifestJson from '../public/component-registry.json';
import type { RegistryManifest } from './registry/types';
import './theme/themes.css';

const manifest = manifestJson as RegistryManifest;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RegistryProvider manifest={manifest}>
        <App />
      </RegistryProvider>
    </Providers>
  </StrictMode>
);
