import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles.css';

const label = getCurrentWindow().label;
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
const params = new URLSearchParams(window.location.search);
const windowParam = params.get('window');

async function bootstrap() {
  const isProcessSelector = label === 'process-selector' || windowParam === 'process-selector';

  if (isProcessSelector) {
    const { default: ProcessSelectorApp } = await import('./ProcessSelectorApp');
    root.render(
      <React.StrictMode>
        <ProcessSelectorApp />
      </React.StrictMode>,
    );
    return;
  }

  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
