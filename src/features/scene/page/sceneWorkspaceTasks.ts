import type {
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { WorkspaceTaskSnapshot, WorkspaceTaskStatus } from '@/shared/contracts';

function normalizeTaskStatus(status: string): WorkspaceTaskStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'loading':
    case 'header-loading':
    case 'children-loading':
    case 'components-loading':
    case 'refreshing':
      return 'running';
    case 'ready':
      return 'success';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

function toRefreshTask(workspace: SceneWorkspaceState): WorkspaceTaskSnapshot | null {
  if (workspace.refreshStatus === 'idle' || (workspace.refreshStatus === 'ready' && !workspace.errorMessage)) {
    return null;
  }

  const updatedAt = workspace.lastUpdatedAt ?? new Date().toISOString();
  return {
    taskId: 'scene-refresh',
    resourceKind: 'scene',
    operationKey: 'scene.refresh',
    scope: 'resource',
    status: normalizeTaskStatus(workspace.refreshStatus),
    progress: {
      completed: workspace.refreshStatus === 'ready' ? 1 : 0,
      total: 1,
      message: workspace.refreshStatus === 'error' ? 'Scene refresh failed' : 'Refreshing scene workspace',
    },
    targetId: null,
    startedAt: updatedAt,
    updatedAt,
    errorMessage: workspace.errorMessage,
  };
}

function toChildrenTask(task: RuntimeSceneObjectChildrenTaskState): WorkspaceTaskSnapshot {
  return {
    taskId: `scene-children-${task.taskId}`,
    resourceKind: 'scene',
    operationKey: 'scene.children.load',
    scope: 'selection',
    status: normalizeTaskStatus(task.status),
    progress: {
      completed: task.loadedCount,
      total: task.totalCount,
      message: `Loading children for ${task.parentObjectAddress}`,
    },
    targetId: task.parentObjectAddress,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    errorMessage: task.errorMessage,
  };
}

function toHeaderTask(task: RuntimeSceneObjectHeaderTaskState): WorkspaceTaskSnapshot {
  return {
    taskId: `scene-object-header-${task.taskId}`,
    resourceKind: 'scene',
    operationKey: 'scene.object-header.load',
    scope: 'selection',
    status: normalizeTaskStatus(task.status),
    progress: {
      completed: task.header ? 1 : 0,
      total: 1,
      message: `Loading header for ${task.objectAddress}`,
    },
    targetId: task.objectAddress,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    errorMessage: task.errorMessage,
  };
}

function toComponentsTask(task: RuntimeSceneObjectComponentsTaskState): WorkspaceTaskSnapshot {
  return {
    taskId: `scene-object-components-${task.taskId}`,
    resourceKind: 'scene',
    operationKey: 'scene.object-components.load',
    scope: 'selection',
    status: normalizeTaskStatus(task.status),
    progress: {
      completed: task.loadedCount,
      total: Math.max(task.totalCount, 1),
      message: `Loading components for ${task.objectAddress}`,
    },
    targetId: task.objectAddress,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    errorMessage: task.errorMessage,
  };
}

export function collectSceneWorkspaceTasks(args: {
  sceneWorkspace: SceneWorkspaceState;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>;
  componentsTaskByAddress: Record<string, RuntimeSceneObjectComponentsTaskState>;
  mutationTask: WorkspaceTaskSnapshot | null;
}): WorkspaceTaskSnapshot[] {
  const tasks: WorkspaceTaskSnapshot[] = [];
  const refreshTask = toRefreshTask(args.sceneWorkspace);
  if (refreshTask) {
    tasks.push(refreshTask);
  }
  if (args.mutationTask) {
    tasks.push(args.mutationTask);
  }
  tasks.push(...Object.values(args.childTaskByParent).map(toChildrenTask));
  tasks.push(...Object.values(args.headerTaskByAddress).map(toHeaderTask));
  tasks.push(...Object.values(args.componentsTaskByAddress).map(toComponentsTask));
  return tasks;
}