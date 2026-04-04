import { emit, listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ProcessInfo } from '@/domain/analysis/contracts';
import type { WorkspaceAttachIntentChannel } from '@/domain/workspace/ports/WorkspaceAttachIntentChannel';
import { createTauriIpcClient } from './TauriIpcClient';

const WORKSPACE_ATTACH_INTENT_EVENT = 'workspace-attach-intent';
const WORKSPACE_REFRESH_PROCESS_CATALOG_EVENT = 'workspace-refresh-process-catalog';
const client = createTauriIpcClient();

export function createTauriWorkspaceAttachIntentChannel(): WorkspaceAttachIntentChannel {
  return {
    openProcessSelector: openWorkspaceProcessSelectorWindow,
    onAttachIntent: onWorkspaceAttachIntent,
  };
}

export async function fetchSystemProcesses() {
  return client.invoke<ProcessInfo[]>({ label: 'fetch_system_processes', command: 'fetch_system_processes' });
}

export async function emitWorkspaceAttachIntent(process: ProcessInfo) {
  await emit(WORKSPACE_ATTACH_INTENT_EVENT, process);
}

export async function openWorkspaceProcessSelectorWindow() {
  const selector = await WebviewWindow.getByLabel('process-selector');
  if (!selector) {
    return;
  }

  await selector.show();
  await selector.setFocus();
  await selector.emit(WORKSPACE_REFRESH_PROCESS_CATALOG_EVENT);
}

export async function onWorkspaceAttachIntent(handler: (process: ProcessInfo) => void | Promise<void>) {
  const dispose = await listen<ProcessInfo>(WORKSPACE_ATTACH_INTENT_EVENT, (event) => handler(event.payload));
  return () => {
    dispose();
  };
}

export async function onWorkspaceProcessCatalogRefresh(handler: () => void | Promise<void>) {
  const dispose = await listen(WORKSPACE_REFRESH_PROCESS_CATALOG_EVENT, () => handler());
  return () => {
    dispose();
  };
}