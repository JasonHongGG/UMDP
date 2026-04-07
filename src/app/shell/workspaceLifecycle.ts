import type { ProcessSession } from '@/domain/analysis/contracts';
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
    sceneObjectComponents: {
      status: 'unknown',
      strategy: null,
      reason: null,
      checkedAt: null,
    },
    connected: false,
    sessionKey: null,
    lastError: null,
    lastHeartbeatAt: null,
  },
};

export function createAttachingWorkspaceLifecycle(): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'attaching',
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'starting',
    },
  };
}

export function createAttachedWithoutSnapshotLifecycle(processSession: ProcessSession): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'attached-without-snapshot',
    processSession,
    runtime: processSession.runtime,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'starting',
      runtime: processSession.runtime,
      capabilities: [
        'metadata',
        'execution',
        'scene-catalog-read',
        'scene-object-header-read',
        'scene-object-children-read',
      ],
      sceneObjectComponents: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.sceneObjectComponents,
      },
      connected: false,
      sessionKey: `${processSession.pid}:${processSession.processName}:${processSession.runtime === 'unknown'
        ? 'Unknown'
        : processSession.runtime === 'il2cpp'
          ? 'Il2cpp'
          : 'Mono'}`,
      lastError: null,
      lastHeartbeatAt: null,
    },
  };
}

export function createAttachFailureWorkspaceLifecycle(errorMessage: string): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'runtime-error',
    errorMessage,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'error',
      capabilities: [],
      sceneObjectComponents: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.sceneObjectComponents,
      },
      connected: false,
      sessionKey: null,
      lastError: errorMessage,
      lastHeartbeatAt: null,
    },
  };
}

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
