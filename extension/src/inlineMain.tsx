import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './inline.css';
import { Inline } from './Inline';
import { applyTheme } from './theme';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Inline />
  </StrictMode>,
);
