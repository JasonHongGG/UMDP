import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ProcessInfo } from '@/domain/analysis/contracts';

export async function fetchSystemProcesses() {
  return invoke<ProcessInfo[]>('fetch_system_processes');
}

export async function emitProcessSelected(process: ProcessInfo) {
  await emit('process-selected', process);
}

export async function openProcessSelectorWindow() {
  const selector = await WebviewWindow.getByLabel('process-selector');
  if (!selector) {
    return;
  }

  await selector.show();
  await selector.setFocus();
  await selector.emit('refresh-processes');
}

export async function onProcessSelected(handler: (process: ProcessInfo) => void | Promise<void>) {
  return listen<ProcessInfo>('process-selected', (event) => handler(event.payload));
}

export async function onRefreshProcesses(handler: () => void | Promise<void>) {
  return listen('refresh-processes', () => handler());
}