import type { ProcessSession, RuntimeFlavor } from './analysis';

export type WorkspacePage = 'inspector' | 'studio';

export type WorkspaceLifecycleStatus =
  | 'detached'
  | 'selecting-process'
  | 'attaching'
  | 'attached-without-snapshot'
  | 'snapshot-loading'
  | 'ready'
  | 'bridge-error'
  | 'recovering';

export interface WorkspaceLifecycleState {
  status: WorkspaceLifecycleStatus;
  processSession: ProcessSession | null;
  runtime: RuntimeFlavor | 'unknown';
  hasSnapshot: boolean;
  errorMessage: string | null;
}
