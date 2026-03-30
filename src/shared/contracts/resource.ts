export type WorkspaceResourceKind =
  | 'workspace-session'
  | 'metadata'
  | 'scene'
  | 'runtime-invoke';

export type WorkspaceTaskStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export type WorkspaceTaskScope = 'workspace' | 'resource' | 'selection';

export interface WorkspaceTaskProgress {
  completed: number;
  total: number | null;
  message: string | null;
}

export interface WorkspaceTaskSnapshot {
  taskId: string;
  resourceKind: WorkspaceResourceKind;
  operationKey: string;
  scope: WorkspaceTaskScope;
  status: WorkspaceTaskStatus;
  progress: WorkspaceTaskProgress | null;
  targetId: string | null;
  startedAt: string;
  updatedAt: string;
  errorMessage: string | null;
}

export interface ResourceSelectionHint {
  resourceKind: WorkspaceResourceKind;
  targetId: string;
  ancestorIds: string[];
}