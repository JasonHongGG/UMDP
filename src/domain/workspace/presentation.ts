import type { ActivePage } from '@/domain/analysis/workspace-types';
import type { ProcessSession } from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  createWorkspacePageReadinessMap,
  describeWorkspaceResetNotice,
  type WorkspacePageReadiness,
  type WorkspaceResetNotice,
  type WorkspaceSignalTone,
} from '@/domain/workspace/pageReadiness';

export interface WorkspacePageDetail extends WorkspacePageReadiness {
  blocked: boolean;
  badge: string;
}

export interface WorkspaceViewState {
  processSession: ProcessSession | null;
  contractVersions: SystemContractVersions | null;
  workspaceLifecycle: WorkspaceLifecycleState;
  activePage: ActivePage;
  workspaceTasks: WorkspaceTaskSnapshot[];
  pageReadiness: Record<ActivePage, WorkspacePageReadiness>;
  workspaceResetNotice: WorkspaceResetNotice | null;
  activeTask: WorkspaceTaskSnapshot | null;
}

export interface WorkspacePresentation {
  lifecycleLabel: string;
  lifecycleTone: WorkspaceSignalTone;
  runtimeLabel: string;
  runtimeTone: WorkspaceSignalTone;
  runtimeFlavorLabel: string | null;
  processLabel: string | null;
  detailMessage: string;
  notice: WorkspaceResetNotice | null;
  pages: Record<ActivePage, WorkspacePageDetail>;
}

interface CreateWorkspaceViewStateArgs {
  processSession: ProcessSession | null;
  contractVersions: SystemContractVersions | null;
  workspaceLifecycle: WorkspaceLifecycleState;
  activePage: ActivePage;
  workspaceTasks: WorkspaceTaskSnapshot[];
  previousLifecycle: WorkspaceLifecycleState | null;
}

export function createWorkspaceViewState({
  processSession,
  contractVersions,
  workspaceLifecycle,
  activePage,
  workspaceTasks,
  previousLifecycle,
}: CreateWorkspaceViewStateArgs): WorkspaceViewState {
  const pageReadiness = createWorkspacePageReadinessMap(workspaceLifecycle);
  const previousSessionKey = previousLifecycle?.runtimeSession.sessionKey ?? null;

  return {
    processSession,
    contractVersions,
    workspaceLifecycle,
    activePage,
    workspaceTasks,
    pageReadiness,
    workspaceResetNotice: describeWorkspaceResetNotice(workspaceLifecycle, previousSessionKey),
    activeTask: selectActiveWorkspaceTask(workspaceTasks),
  };
}

export function createWorkspacePresentation(view: WorkspaceViewState): WorkspacePresentation {
  const { workspaceLifecycle } = view;
  const lifecycleTone = getWorkspaceLifecycleTone(workspaceLifecycle);
  const pages = {
    inspector: describePageDetail('inspector', view.pageReadiness.inspector),
    studio: describePageDetail('studio', view.pageReadiness.studio),
    scene: describePageDetail('scene', view.pageReadiness.scene),
  };

  return {
    lifecycleLabel: getWorkspaceLifecycleLabel(workspaceLifecycle),
    lifecycleTone,
    runtimeLabel: formatRuntimeSessionLabel(workspaceLifecycle),
    runtimeTone: workspaceLifecycle.runtimeSession.connected ? 'ready' : view.pageReadiness[view.activePage].tone,
    runtimeFlavorLabel: workspaceLifecycle.processSession ? `${workspaceLifecycle.runtime} Runtime` : null,
    processLabel: workspaceLifecycle.processSession
      ? `${workspaceLifecycle.processSession.processName} (${workspaceLifecycle.processSession.pid})`
      : null,
    detailMessage: resolveWorkspaceDetailMessage(view),
    notice: view.workspaceResetNotice,
    pages,
  };
}

function describePageDetail(page: ActivePage, readiness: WorkspacePageReadiness): WorkspacePageDetail {
  return {
    ...readiness,
    blocked: page === 'inspector' ? !readiness.catalogReady : !readiness.selectionReady,
    badge: describePageBadge(page, readiness),
  };
}

function describePageBadge(page: ActivePage, readiness: WorkspacePageReadiness) {
  if (!readiness.sessionReady) {
    return 'session required';
  }

  if (!readiness.catalogReady) {
    return readiness.tone === 'error' ? 'catalog error' : 'catalog pending';
  }

  if (page !== 'inspector' && !readiness.capabilityAvailable) {
    return 'capability unavailable';
  }

  if (page !== 'inspector' && !readiness.selectionReady) {
    return readiness.tone === 'error' ? 'runtime locked' : 'runtime pending';
  }

  return 'ready';
}

function resolveWorkspaceDetailMessage(view: WorkspaceViewState) {
  if (view.activeTask?.progress?.message) {
    return view.activeTask.progress.total != null
      ? `${view.activeTask.progress.message} (${view.activeTask.progress.completed}/${view.activeTask.progress.total})`
      : view.activeTask.progress.message;
  }

  if (view.workspaceResetNotice?.message) {
    return view.workspaceResetNotice.message;
  }

  if (view.workspaceLifecycle.runtimeSession.lastError) {
    return view.workspaceLifecycle.runtimeSession.lastError;
  }

  if (view.workspaceLifecycle.errorMessage) {
    return view.workspaceLifecycle.errorMessage;
  }

  if (view.workspaceLifecycle.processSession) {
    return `${view.workspaceLifecycle.processSession.processName} (${view.workspaceLifecycle.processSession.pid})`;
  }

  return 'No process attached';
}

function getWorkspaceLifecycleLabel(state: WorkspaceLifecycleState) {
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

function getWorkspaceLifecycleTone(state: WorkspaceLifecycleState): WorkspaceSignalTone {
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

function formatRuntimeSessionLabel(workspace: WorkspaceLifecycleState) {
  switch (workspace.runtimeSession.status) {
    case 'ready':
      return 'Runtime Ready';
    case 'starting':
      return 'Runtime Starting';
    case 'degraded':
      return 'Runtime Degraded';
    case 'error':
      return 'Runtime Error';
    case 'idle':
    default:
      return 'Runtime Idle';
  }
}

function selectActiveWorkspaceTask(tasks: WorkspaceTaskSnapshot[]) {
  const statusRank: Record<WorkspaceTaskSnapshot['status'], number> = {
    running: 0,
    queued: 1,
    error: 2,
    cancelled: 3,
    success: 4,
    idle: 5,
  };

  return [...tasks]
    .filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'error')
    .sort((left, right) => {
      const rankDelta = statusRank[left.status] - statusRank[right.status];
      if (rankDelta !== 0) {
        return rankDelta;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })[0] ?? null;
}