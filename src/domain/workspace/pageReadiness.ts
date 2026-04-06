import type { WorkspaceLifecycleState, WorkspacePage } from '@/shared/contracts';

export type WorkspaceSignalTone = 'ready' | 'loading' | 'warning' | 'error' | 'idle';

export interface WorkspacePageReadiness {
  page: WorkspacePage;
  sessionReady: boolean;
  catalogReady: boolean;
  capabilityAvailable: boolean;
  selectionReady: boolean;
  tone: WorkspaceSignalTone;
  title: string;
  description: string;
}

export interface WorkspaceResetNotice {
  kind: 'session-changed' | 'detached' | 'runtime-error' | 'snapshot-loading';
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

function buildSessionBlockedState(page: WorkspacePage, workspace: WorkspaceLifecycleState): WorkspacePageReadiness {
  const errorMessage = workspace.errorMessage ?? workspace.runtimeSession.lastError;
  if (errorMessage) {
    return {
      page,
      sessionReady: false,
      catalogReady: false,
      capabilityAvailable: page === 'inspector',
      selectionReady: false,
      tone: 'error',
      title: 'Session Unavailable',
      description: errorMessage,
    };
  }

  return {
    page,
    sessionReady: false,
    catalogReady: false,
    capabilityAvailable: page === 'inspector',
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
    return buildSessionBlockedState(page, workspace);
  }

  const catalogReady = workspace.hasSnapshot;
  if (!catalogReady) {
    const errorMessage = workspace.errorMessage ?? workspace.runtimeSession.lastError;
    if (errorMessage) {
      return {
        page,
        sessionReady: true,
        catalogReady: false,
        capabilityAvailable: page === 'inspector' ? true : page === 'scene' ? hasSceneCapability(workspace) : hasExecutionCapability(workspace),
        selectionReady: false,
        tone: 'error',
        title: 'Catalog Unavailable',
        description: errorMessage,
      };
    }

    return {
      page,
      sessionReady: true,
      catalogReady: false,
      capabilityAvailable: page === 'inspector' ? true : page === 'scene' ? hasSceneCapability(workspace) : hasExecutionCapability(workspace),
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
      capabilityAvailable: true,
      selectionReady: true,
      tone: 'ready',
      title: 'Inspector Ready',
      description: 'Inspector metadata is available.',
    };
  }

  const capabilityAvailable = page === 'scene'
    ? hasSceneCapability(workspace)
    : hasExecutionCapability(workspace);

  if (!capabilityAvailable) {
    return {
      page,
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: false,
      selectionReady: false,
      tone: 'warning',
      title: page === 'scene' ? 'Scene Capability Missing' : 'Runtime Capability Missing',
      description: page === 'scene'
        ? 'The attached runtime does not expose scene read capabilities for this workspace.'
        : 'The attached runtime does not expose workflow execution capabilities for this workspace.',
    };
  }

  const selectionReady = workspace.status === 'ready' && hasInteractiveRuntime(workspace);
  if (!selectionReady) {
    return {
      page,
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: true,
      selectionReady: false,
      tone: workspace.status === 'runtime-error' ? 'error' : 'loading',
      title: page === 'scene' ? 'Scene Runtime Locked' : 'Studio Runtime Locked',
      description: workspace.runtimeSession.lastError
        ?? workspace.errorMessage
        ?? (page === 'scene'
          ? 'Scene hierarchy, selection, and mutations stay gated until the runtime session is healthy.'
          : 'Studio document editing and runtime execution stay gated until the runtime session is healthy.'),
    };
  }

  return {
    page,
    sessionReady: true,
    catalogReady: true,
    capabilityAvailable: true,
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

  if (workspace.status === 'runtime-error') {
    return {
      kind: 'runtime-error',
      tone: 'error',
      title: 'Runtime Error',
      message: workspace.runtimeSession.lastError ?? workspace.errorMessage ?? 'Runtime state is unavailable.',
    };
  }

  if (workspace.status === 'snapshot-loading') {
    return {
      kind: 'snapshot-loading',
      tone: 'loading',
      title: 'Catalog Preparing',
      message: 'Metadata and resource catalogs are still loading for the attached Unity session.',
    };
  }

  return null;
}