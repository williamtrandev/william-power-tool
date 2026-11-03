import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { Popup } from './Popup';

document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
