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
  | 'scene-catalog-read'
  | 'scene-object-header-read'
  | 'scene-object-children-read'
  | 'scene-object-components-read';

export type RuntimeSceneObjectComponentsCapabilityStatus = 'unknown' | 'supported' | 'unsupported';

export type RuntimeSceneObjectComponentsStrategy = 'indexed-game-object-api' | 'get-components-by-type';

export interface RuntimeSceneObjectComponentsCapabilityState {
  status: RuntimeSceneObjectComponentsCapabilityStatus;
  strategy: RuntimeSceneObjectComponentsStrategy | null;
  reason: string | null;
  checkedAt: string | null;
}

export interface RuntimeSessionState {
  status: RuntimeSessionStatus;
  runtime: RuntimeFlavor | 'unknown';
  capabilities: RuntimeCapability[];
  sceneObjectComponents: RuntimeSceneObjectComponentsCapabilityState;
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
