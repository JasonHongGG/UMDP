import type { ProcessSession, RuntimeFlavor } from './analysis';

export type WorkspacePage = 'inspector' | 'studio' | 'scene';

export type RuntimeSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'error';

export type RuntimeCapability =
  | 'metadata'
  | 'preview-query'
  | 'execution'
  | 'instance-enumeration'
  | 'field-read'
  | 'field-write'
  | 'method-invoke'
  | 'scene-read';

export interface RuntimeSessionState {
  status: RuntimeSessionStatus;
  runtime: RuntimeFlavor | 'unknown';
  capabilities: RuntimeCapability[];
  connected: boolean;
  sessionKey: string | null;
  lastError: string | null;
  lastHeartbeatAt: string | null;
}

export type WorkspaceLifecycleStatus =
  | 'detached'
  | 'selecting-process'
  | 'attaching'
  | 'attached-without-snapshot'
  | 'snapshot-loading'
  | 'ready'
  | 'runtime-error';

export interface WorkspaceLifecycleState {
  resourceRevision: number;
  status: WorkspaceLifecycleStatus;
  processSession: ProcessSession | null;
  runtime: RuntimeFlavor | 'unknown';
  hasSnapshot: boolean;
  errorMessage: string | null;
  runtimeSession: RuntimeSessionState;
}

export interface SystemContractVersions {
  tauriCommandVersion: number;
  analysisSchemaVersion: number;
  workflowSchemaVersion: number;
}
