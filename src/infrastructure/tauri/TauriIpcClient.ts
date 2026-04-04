import { invoke } from '@tauri-apps/api/core';
import { createDiagnosticsLogger } from '@/shared/diagnostics';
import {
  type CommandEnvelope,
  coerceOperationErrorEnvelope,
  createOperationErrorEnvelope,
} from '@/shared/contracts';

export interface TauriInvokeRequest {
  label: string;
  command: string;
  args?: Record<string, unknown>;
  logSuccess?: boolean;
}

export interface TauriIpcClient {
  invoke<T>(request: TauriInvokeRequest): Promise<T>;
}

export class AppCommandError extends Error {
  readonly envelope;

  constructor(envelope: ReturnType<typeof createOperationErrorEnvelope>) {
    super(envelope.message);
    this.name = 'AppCommandError';
    this.envelope = envelope;
  }
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
        const result = await invoke<CommandEnvelope<T>>(command, args);
        if (!result.ok) {
          throw new AppCommandError(coerceOperationErrorEnvelope(result.error, label));
        }

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
        return result.data;
      } catch (error) {
        const normalizedError = error instanceof AppCommandError
          ? error
          : new AppCommandError(coerceOperationErrorEnvelope(error, label));
        tauriDiagnostics.error('Tauri invoke failed.', {
          error: normalizedError,
          context: {
            operation: label,
            command,
            args,
            durationMs: nowMs() - startedAt,
          },
        });
        throw normalizedError;
      }
    },
  };
}