import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindowLabel } from './infrastructure/tauri/TauriWindowGateway';
import './styles.css';

const label = getCurrentWindowLabel();
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
