import type { WorkspaceLifecycleState, WorkspacePage, WorkspacePageSystemState } from '@/shared/contracts';

export type WorkspaceSignalTone = 'ready' | 'loading' | 'warning' | 'error' | 'idle';

export interface WorkspacePageReadiness {
  page: WorkspacePage;
  systemState: WorkspacePageSystemState;
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

interface WorkspacePageCopy {
  readyTitle: string;
  readyDescription: string;
  capabilityTitle: string;
  capabilityDescription: string;
  runtimeLoadingTitle: string;
  runtimeLoadingDescription: string;
  runtimeDegradedTitle: string;
  runtimeDegradedDescription: string;
  runtimeErrorTitle: string;
  runtimeErrorDescription: string;
}

function hasExecutionCapability(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.capabilities.includes('execution');
}

function hasSceneCapability(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.capabilities.includes('scene-catalog-read')
    && workspace.runtimeSession.capabilities.includes('scene-object-header-read')
    && workspace.runtimeSession.capabilities.includes('scene-object-children-read');
}

function hasInteractiveRuntime(workspace: WorkspaceLifecycleState) {
  return workspace.runtimeSession.connected
    && (workspace.runtimeSession.status === 'ready' || workspace.runtimeSession.status === 'degraded');
}

function getPageCopy(page: WorkspacePage): WorkspacePageCopy {
  switch (page) {
    case 'scene':
      return {
        readyTitle: 'Scene Ready',
        readyDescription: 'Scene hierarchy, selection, and mutations are available.',
        capabilityTitle: 'Scene Capability Unavailable',
        capabilityDescription: 'The attached runtime does not expose the scene catalog and object inspection capabilities required for this workspace.',
        runtimeLoadingTitle: 'Scene Runtime Preparing',
        runtimeLoadingDescription: 'Scene hierarchy, selection, and mutations stay gated until the runtime session is healthy.',
        runtimeDegradedTitle: 'Scene Runtime Degraded',
        runtimeDegradedDescription: 'Scene hierarchy and selection remain available, but runtime-backed mutations may be limited until the session recovers.',
        runtimeErrorTitle: 'Scene Runtime Unavailable',
        runtimeErrorDescription: 'Scene hierarchy, selection, and mutations remain unavailable until the runtime session is healthy.',
      };
    case 'studio':
      return {
        readyTitle: 'Studio Ready',
        readyDescription: 'Studio document editing and runtime execution are available.',
        capabilityTitle: 'Runtime Capability Unavailable',
        capabilityDescription: 'The attached runtime does not expose workflow execution capabilities for this workspace.',
        runtimeLoadingTitle: 'Studio Runtime Preparing',
        runtimeLoadingDescription: 'Studio document editing and runtime execution stay gated until the runtime session is healthy.',
        runtimeDegradedTitle: 'Studio Runtime Degraded',
        runtimeDegradedDescription: 'Studio editing remains available, but runtime execution may be limited until the session recovers.',
        runtimeErrorTitle: 'Studio Runtime Unavailable',
        runtimeErrorDescription: 'Studio document editing and runtime execution remain unavailable until the runtime session is healthy.',
      };
    case 'inspector':
    default:
      return {
        readyTitle: 'Inspector Ready',
        readyDescription: 'Inspector metadata is available.',
        capabilityTitle: 'Inspector Capability Unavailable',
        capabilityDescription: 'Inspector metadata is unavailable for the attached runtime session.',
        runtimeLoadingTitle: 'Inspector Preparing',
        runtimeLoadingDescription: 'Inspector metadata is still loading for the attached process.',
        runtimeDegradedTitle: 'Inspector Degraded',
        runtimeDegradedDescription: 'Inspector metadata remains available, but runtime-backed details may be limited.',
        runtimeErrorTitle: 'Inspector Unavailable',
        runtimeErrorDescription: 'Inspector metadata remains unavailable until the workspace snapshot is restored.',
      };
  }
}

function buildSessionBlockedState(page: WorkspacePage, workspace: WorkspaceLifecycleState): WorkspacePageReadiness {
  const errorMessage = workspace.errorMessage ?? workspace.runtimeSession.lastError;
  if (errorMessage) {
    return {
      page,
      systemState: 'session-unavailable',
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
    systemState: 'session-required',
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
  const pageCopy = getPageCopy(page);
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
        systemState: 'catalog-error',
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
      systemState: 'catalog-loading',
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
      systemState: 'ready',
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: true,
      selectionReady: true,
      tone: 'ready',
      title: pageCopy.readyTitle,
      description: pageCopy.readyDescription,
    };
  }

  const capabilityAvailable = page === 'scene'
    ? hasSceneCapability(workspace)
    : hasExecutionCapability(workspace);

  if (!capabilityAvailable) {
    return {
      page,
      systemState: 'capability-unavailable',
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: false,
      selectionReady: false,
      tone: 'warning',
      title: pageCopy.capabilityTitle,
      description: pageCopy.capabilityDescription,
    };
  }

  const selectionReady = workspace.status === 'ready' && hasInteractiveRuntime(workspace);
  if (!selectionReady) {
    const runtimeUnavailable = workspace.status === 'runtime-error' || workspace.runtimeSession.status === 'error';
    return {
      page,
      systemState: runtimeUnavailable ? 'runtime-error' : 'runtime-loading',
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: true,
      selectionReady: false,
      tone: runtimeUnavailable ? 'error' : 'loading',
      title: runtimeUnavailable ? pageCopy.runtimeErrorTitle : pageCopy.runtimeLoadingTitle,
      description: runtimeUnavailable
        ? (workspace.runtimeSession.lastError ?? workspace.errorMessage ?? pageCopy.runtimeErrorDescription)
        : pageCopy.runtimeLoadingDescription,
    };
  }

  if (workspace.runtimeSession.status === 'degraded') {
    return {
      page,
      systemState: 'runtime-degraded',
      sessionReady: true,
      catalogReady: true,
      capabilityAvailable: true,
      selectionReady: true,
      tone: 'warning',
      title: pageCopy.runtimeDegradedTitle,
      description: workspace.runtimeSession.lastError
        ? `${pageCopy.runtimeDegradedDescription} ${workspace.runtimeSession.lastError}`
        : pageCopy.runtimeDegradedDescription,
    };
  }

  return {
    page,
    systemState: 'ready',
    sessionReady: true,
    catalogReady: true,
    capabilityAvailable: true,
    selectionReady: true,
    tone: 'ready',
    title: pageCopy.readyTitle,
    description: pageCopy.readyDescription,
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