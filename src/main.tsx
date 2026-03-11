import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import ProcessSelectorApp from './ProcessSelectorApp';
import './styles.css';

const label = getCurrentWindow().label;
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
const params = new URLSearchParams(window.location.search);
const windowParam = params.get('window');

if (label === 'process-selector' || windowParam === 'process-selector') {
  root.render(
    <React.StrictMode>
      <ProcessSelectorApp />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
