import { invoke } from '@tauri-apps/api/core';
import { createDiagnosticsLogger } from '@/shared/diagnostics';

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

const tauriDiagnostics = createDiagnosticsLogger({
  channel: 'transport',
  origin: 'TauriIpcClient',
});

export function createTauriIpcClient(): TauriIpcClient {
  return {
    async invoke<T>({ label, command, args, logSuccess = true }: TauriInvokeRequest): Promise<T> {
      const startedAt = nowMs();

      try {
        const result = await invoke<T>(command, args);
        if (logSuccess) {
          tauriDiagnostics.debug('Tauri invoke completed.', {
            context: {
              operation: label,
              command,
              args,
              durationMs: nowMs() - startedAt,
            },
          });
        }
        return result;
      } catch (error) {
        tauriDiagnostics.error('Tauri invoke failed.', {
          error,
          context: {
            operation: label,
            command,
            args,
            durationMs: nowMs() - startedAt,
          },
        });
        throw error;
      }
    },
  };
}