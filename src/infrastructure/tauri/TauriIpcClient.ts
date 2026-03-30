import { invoke } from '@tauri-apps/api/core';

export interface TauriInvokeRequest {
  label: string;
  command: string;
  args?: Record<string, unknown>;
  logSuccess?: boolean;
}

export interface TauriIpcClient {
  invoke<T>(request: TauriInvokeRequest): Promise<T>;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createTauriIpcClient(): TauriIpcClient {
  return {
    async invoke<T>({ label, command, args, logSuccess = true }: TauriInvokeRequest): Promise<T> {
      const startedAt = nowMs();

      try {
        const result = await invoke<T>(command, args);
        if (logSuccess) {
          console.log(`[perf][tauri] ${label} completed in ${(nowMs() - startedAt).toFixed(1)}ms`);
        }
        return result;
      } catch (error) {
        console.log(`[perf][tauri] ${label} failed in ${(nowMs() - startedAt).toFixed(1)}ms`, error);
        throw error;
      }
    },
  };
}