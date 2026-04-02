import type { WorkspaceLifecycleState, WorkspacePage } from '@/shared/contracts';

export type WorkspaceSignalTone = 'ready' | 'loading' | 'warning' | 'error' | 'idle';

export interface WorkspacePageReadiness {
  page: WorkspacePage;
  sessionReady: boolean;
  catalogReady: boolean;
  selectionReady: boolean;
  tone: WorkspaceSignalTone;
  title: string;
  description: string;
}

export interface WorkspaceResetNotice {
  kind: 'session-changed' | 'detached' | 'recovering' | 'runtime-error' | 'snapshot-loading';
  tone: WorkspaceSignalTone;
  title: string;
  message: string;
}

function hasExecutionCapability(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.capabilities.includes('execution');
}

function hasSceneCapability(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.capabilities.includes('scene-read');
}

function hasInteractiveRuntime(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.connected
    && (workspace.runtimeSession.status === 'ready' || workspace.runtimeSession.status === 'degraded');
}

function buildSessionBlockedState(page: WorkspacePage): WorkspacePageReadiness {
  return {
    page,
    sessionReady: false,
    catalogReady: false,
    selectionReady: false,
    tone: 'idle',
    title: 'Session Required',
    description: 'Attach to a Unity process before opening this workspace.',
  };
}

export function getWorkspacePageReadiness(
  page: WorkspacePage,
  workspace: WorkspaceLifecycleState,
): WorkspacePageReadiness {
  const sessionReady = workspace.processSession != null;
  if (!sessionReady) {
    return buildSessionBlockedState(page);
  }

  const catalogReady = workspace.hasSnapshot;
  if (!catalogReady) {
    return {
      page,
      sessionReady: true,
      catalogReady: false,
      selectionReady: false,
      tone: workspace.status === 'snapshot-loading' ? 'loading' : 'warning',
      title: 'Catalog Preparing',
      description: 'Metadata and resource catalogs are still loading for the attached process.',
    };
  }

  if (page === 'inspector') {
    return {
      page,
      sessionReady: true,
      catalogReady: true,
      selectionReady: true,
      tone: 'ready',
      title: 'Inspector Ready',
      description: 'Inspector metadata is available.',
    };
  }

  const needsRuntime = page === 'scene' ? hasSceneCapability(workspace) : hasExecutionCapability(workspace);
  const selectionReady = needsRuntime && workspace.status === 'ready' && hasInteractiveRuntime(workspace);

  if (!selectionReady) {
    return {
      page,
      sessionReady: true,
      catalogReady: true,
      selectionReady: false,
      tone: workspace.status === 'recovering' || workspace.status === 'runtime-error' ? 'error' : 'loading',
      title: page === 'scene' ? 'Selection Locked' : 'Runtime Locked',
      description: page === 'scene'
        ? 'Scene catalog is loaded, but runtime selection and mutations stay gated until the runtime session is healthy.'
        : 'Studio document is loaded, but runtime execution stays gated until the runtime session is healthy.',
    };
  }

  return {
    page,
    sessionReady: true,
    catalogReady: true,
    selectionReady: true,
    tone: 'ready',
    title: page === 'scene' ? 'Scene Ready' : 'Studio Ready',
    description: page === 'scene'
      ? 'Scene hierarchy, selection, and mutations are available.'
      : 'Studio document editing and runtime execution are available.',
  };
}

export function createWorkspacePageReadinessMap(workspace: WorkspaceLifecycleState) {
  return {
    inspector: getWorkspacePageReadiness('inspector', workspace),
    studio: getWorkspacePageReadiness('studio', workspace),
    scene: getWorkspacePageReadiness('scene', workspace),
  };
}

export function describeWorkspaceResetNotice(
  workspace: WorkspaceLifecycleState,
  previousSessionKey: string | null,
): WorkspaceResetNotice | null {
  const currentSessionKey = workspace.runtimeSession.sessionKey;

  if (previousSessionKey && currentSessionKey && previousSessionKey !== currentSessionKey) {
    return {
      kind: 'session-changed',
      tone: 'warning',
      title: 'Workspace Reset',
      message: 'A new Unity session is active. Scene, Studio, and runtime caches are being rebuilt for the new process.',
    };
  }

  if (previousSessionKey && !currentSessionKey) {
    return {
      kind: 'detached',
      tone: 'warning',
      title: 'Workspace Cleared',
      message: 'The current Unity session was detached. Resource state has been cleared.',
    };
  }

  if (workspace.status === 'snapshot-loading') {
    return {
      kind: 'snapshot-loading',
      tone: 'loading',
      title: 'Snapshot Loading',
      message: 'Metadata and resource catalogs are loading. Interactive resource state remains gated until this completes.',
    };
  }

  if (workspace.status === 'recovering') {
    return {
      kind: 'recovering',
      tone: 'error',
      title: 'Runtime Recovering',
      message: workspace.errorMessage
        ?? workspace.runtimeSession.lastError
        ?? 'Runtime connectivity is recovering. Cached state may be invalidated and rebuilt.',
    };
  }

  if (workspace.status === 'runtime-error') {
    return {
      kind: 'runtime-error',
      tone: 'error',
      title: 'Runtime Error',
      message: workspace.errorMessage
        ?? workspace.runtimeSession.lastError
        ?? 'The runtime session is unavailable. Resource actions remain blocked until the runtime is healthy again.',
    };
  }

  return null;
}