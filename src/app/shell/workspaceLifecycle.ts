import type { WorkspaceLifecycleState } from '@/shared/contracts';

export const EMPTY_WORKSPACE_LIFECYCLE: WorkspaceLifecycleState = {
  resourceRevision: 0,
  status: 'detached',
  processSession: null,
  runtime: 'unknown',
  hasSnapshot: false,
  errorMessage: null,
  runtimeSession: {
    status: 'idle',
    runtime: 'unknown',
    capabilities: ['metadata'],
    connected: false,
    sessionKey: null,
    lastError: null,
    lastHeartbeatAt: null,
  },
};

export function getWorkspaceLifecycleLabel(state: WorkspaceLifecycleState) {
  switch (state.status) {
    case 'detached':
      return 'Detached';
    case 'selecting-process':
      return 'Selecting Process';
    case 'attaching':
      return 'Attaching';
    case 'attached-without-snapshot':
      return 'Attached';
    case 'snapshot-loading':
      return 'Loading Snapshot';
    case 'ready':
      return 'Ready';
    case 'runtime-error':
      return 'Runtime Error';
    case 'recovering':
      return 'Recovering';
    default:
      return 'Unknown';
  }
}

export function getWorkspaceLifecycleTone(state: WorkspaceLifecycleState) {
  switch (state.status) {
    case 'ready':
      return 'ready';
    case 'snapshot-loading':
    case 'attaching':
    case 'selecting-process':
    case 'recovering':
      return 'loading';
    case 'runtime-error':
      return 'error';
    case 'attached-without-snapshot':
      return 'warning';
    case 'detached':
    default:
      return 'idle';
  }
}
