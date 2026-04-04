import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import {
  onSceneObjectChildrenTaskUpdated,
  onSceneObjectInspectorTaskUpdated,
  onSceneWorkspaceStateUpdated,
} from '@/infrastructure/tauri/TauriSceneEvents';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import {
  isTerminalChildrenTaskStatus,
  isTerminalInspectorTaskStatus,
  logSceneError,
  logScenePerf,
} from './sceneWorkspaceStatePatches';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function compareSceneWorkspaceVersion(
  left: Pick<SceneWorkspaceState, 'resourceRevision' | 'mutationEpoch'>,
  right: Pick<SceneWorkspaceState, 'resourceRevision' | 'mutationEpoch'>,
) {
  if (left.resourceRevision !== right.resourceRevision) {
    return left.resourceRevision - right.resourceRevision;
  }

  return left.mutationEpoch - right.mutationEpoch;
}

function isOlderSceneTask(
  currentTask: Pick<RuntimeSceneObjectChildrenTaskState, 'mutationEpoch' | 'taskId' | 'resourceRevision'>,
  nextTask: Pick<RuntimeSceneObjectChildrenTaskState, 'mutationEpoch' | 'taskId' | 'resourceRevision'>,
) {
  if (currentTask.mutationEpoch !== nextTask.mutationEpoch) {
    return currentTask.mutationEpoch > nextTask.mutationEpoch;
  }

  if (currentTask.taskId !== nextTask.taskId) {
    return currentTask.taskId > nextTask.taskId;
  }

  return currentTask.resourceRevision > nextTask.resourceRevision;
}

function shouldReuseChildrenTask(
  taskState: RuntimeSceneObjectChildrenTaskState,
  latestMutationEpoch: number,
  force: boolean,
) {
  if (force) {
    return false;
  }

  if (taskState.mutationEpoch < latestMutationEpoch) {
    return false;
  }

  if (taskState.resourceState.freshness === 'fresh'
    && taskState.status === 'ready'
    && taskState.loadedCount >= taskState.totalCount) {
    return true;
  }

  return taskState.resourceState.freshness === 'refreshing' || !isTerminalChildrenTaskStatus(taskState.status);
}

function shouldReuseInspectorTask(
  taskState: RuntimeSceneObjectInspectorTaskState,
  latestMutationEpoch: number,
  force: boolean,
) {
  if (force) {
    return false;
  }

  if (taskState.mutationEpoch < latestMutationEpoch) {
    return false;
  }

  if (taskState.resourceState.freshness === 'fresh'
    && taskState.status === 'ready'
    && taskState.header) {
    return true;
  }

  return taskState.resourceState.freshness === 'refreshing' || !isTerminalInspectorTaskStatus(taskState.status);
}

interface UseSceneWorkspaceSyncOptions {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
  sceneWorkspace: SceneWorkspaceState;
  selectedObjectAddress: string | null;
  setSceneWorkspace: Dispatch<SetStateAction<SceneWorkspaceState>>;
  setLoadingChildrenByParent: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChildErrorByParent: Dispatch<SetStateAction<Record<string, string | null>>>;
  setInspectorLoadingByAddress: Dispatch<SetStateAction<Record<string, boolean>>>;
  setInspectorErrorByAddress: Dispatch<SetStateAction<Record<string, string | null>>>;
  processKeyRef: MutableRefObject<string | null>;
  childTaskByParentRef: MutableRefObject<Record<string, RuntimeSceneObjectChildrenTaskState>>;
  inspectorTaskByAddressRef: MutableRefObject<Record<string, RuntimeSceneObjectInspectorTaskState>>;
  resetSceneState: () => void;
  applySceneChildrenTaskState: (taskState: RuntimeSceneObjectChildrenTaskState) => void;
  applyInspectorTaskState: (taskState: RuntimeSceneObjectInspectorTaskState) => void;
}

export function useSceneWorkspaceSync({
  repository,
  workspaceLifecycle,
  active,
  sceneWorkspace,
  selectedObjectAddress,
  setSceneWorkspace,
  setLoadingChildrenByParent,
  setChildErrorByParent,
  setInspectorLoadingByAddress,
  setInspectorErrorByAddress,
  processKeyRef,
  childTaskByParentRef,
  inspectorTaskByAddressRef,
  resetSceneState,
  applySceneChildrenTaskState,
  applyInspectorTaskState,
}: UseSceneWorkspaceSyncOptions) {
  const currentSceneSessionKey = workspaceLifecycle.runtimeSession.sessionKey ?? null;
  const currentSceneSessionKeyRef = useRef<string | null>(currentSceneSessionKey);
  const latestSceneWorkspaceVersionRef = useRef({
    resourceRevision: sceneWorkspace.resourceRevision,
    mutationEpoch: sceneWorkspace.mutationEpoch,
  });

  useEffect(() => {
    currentSceneSessionKeyRef.current = currentSceneSessionKey;
  }, [currentSceneSessionKey]);

  useEffect(() => {
    latestSceneWorkspaceVersionRef.current = {
      resourceRevision: sceneWorkspace.resourceRevision,
      mutationEpoch: sceneWorkspace.mutationEpoch,
    };
  }, [sceneWorkspace.mutationEpoch, sceneWorkspace.resourceRevision]);

  const updateSceneWorkspace = useCallback((nextState: SetStateAction<SceneWorkspaceState>) => {
    setSceneWorkspace((previous) => {
      const resolved = typeof nextState === 'function'
        ? nextState(previous)
        : nextState;
      latestSceneWorkspaceVersionRef.current = {
        resourceRevision: resolved.resourceRevision,
        mutationEpoch: resolved.mutationEpoch,
      };
      return resolved;
    });
  }, [setSceneWorkspace]);

  const resetSceneWorkspaceState = useCallback(() => {
    latestSceneWorkspaceVersionRef.current = {
      resourceRevision: 0,
      mutationEpoch: 0,
    };
    resetSceneState();
  }, [resetSceneState]);

  const matchesCurrentSceneSession = useCallback((sessionKey: string | null | undefined) => {
    return (sessionKey ?? null) === currentSceneSessionKeyRef.current;
  }, []);

  const shouldAcceptSceneWorkspace = useCallback((workspace: SceneWorkspaceState) => {
    return matchesCurrentSceneSession(workspace.sessionKey)
      && compareSceneWorkspaceVersion(workspace, latestSceneWorkspaceVersionRef.current) >= 0;
  }, [matchesCurrentSceneSession]);

  const shouldAcceptChildrenTask = useCallback((taskState: RuntimeSceneObjectChildrenTaskState) => {
    if (!matchesCurrentSceneSession(taskState.sessionKey)) {
      return false;
    }

    if (taskState.mutationEpoch < latestSceneWorkspaceVersionRef.current.mutationEpoch) {
      return false;
    }

    const currentTask = childTaskByParentRef.current[taskState.parentObjectAddress];
    if (!currentTask) {
      return true;
    }

    return !isOlderSceneTask(currentTask, taskState);
  }, [childTaskByParentRef, matchesCurrentSceneSession]);

  const shouldAcceptInspectorTask = useCallback((taskState: RuntimeSceneObjectInspectorTaskState) => {
    if (!matchesCurrentSceneSession(taskState.sessionKey)) {
      return false;
    }

    if (taskState.mutationEpoch < latestSceneWorkspaceVersionRef.current.mutationEpoch) {
      return false;
    }

    const currentTask = inspectorTaskByAddressRef.current[taskState.objectAddress];
    if (!currentTask) {
      return true;
    }

    return !isOlderSceneTask(currentTask, taskState);
  }, [inspectorTaskByAddressRef, matchesCurrentSceneSession]);

  const loadSceneObjectInspector = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = inspectorTaskByAddressRef.current[objectAddress];
    if (currentTask && shouldReuseInspectorTask(
      currentTask,
      latestSceneWorkspaceVersionRef.current.mutationEpoch,
      force,
    )) {
      return;
    }

    const startedAt = nowMs();
    setInspectorLoadingByAddress((previous) => ({
      ...previous,
      [objectAddress]: true,
    }));
    setInspectorErrorByAddress((previous) => ({
      ...previous,
      [objectAddress]: null,
    }));

    try {
      const taskState = await repository.startSceneObjectInspectorAnalysis(objectAddress);
      if (!taskState || !shouldAcceptInspectorTask(taskState)) {
        return;
      }

      applyInspectorTaskState(taskState);

      if (taskState.header) {
        logScenePerf(`getSceneObjectInspector:${objectAddress}`, startedAt, {
          status: taskState.status,
          childCount: taskState.childrenLoadedCount,
          childTotal: taskState.childrenTotalCount,
          componentCount: taskState.componentsLoadedCount,
          componentTotal: taskState.componentsTotalCount,
        });
      }
    } catch (error) {
      const message = logSceneError(`getSceneObjectInspector failed for ${objectAddress}`, error);
      setInspectorErrorByAddress((previous) => ({
        ...previous,
        [objectAddress]: message,
      }));
    }
  }, [applyInspectorTaskState, inspectorTaskByAddressRef, repository, setInspectorErrorByAddress, setInspectorLoadingByAddress, shouldAcceptInspectorTask]);

  const ensureSceneObjectChildrenLoaded = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = childTaskByParentRef.current[objectAddress];
    if (currentTask && shouldReuseChildrenTask(
      currentTask,
      latestSceneWorkspaceVersionRef.current.mutationEpoch,
      force,
    )) {
      return;
    }

    const startedAt = nowMs();
    setLoadingChildrenByParent((previous) => ({
      ...previous,
      [objectAddress]: true,
    }));
    setChildErrorByParent((previous) => ({
      ...previous,
      [objectAddress]: null,
    }));

    try {
      const taskState = await repository.startSceneObjectChildrenAnalysis(objectAddress);
      if (!taskState || !shouldAcceptChildrenTask(taskState)) {
        return;
      }

      applySceneChildrenTaskState(taskState);

      logScenePerf(`getSceneObjectChildren:${objectAddress}`, startedAt, {
        status: taskState.status,
        loadedCount: taskState.loadedCount,
        totalCount: taskState.totalCount,
      });
    } catch (error) {
      const message = logSceneError(`getSceneObjectChildren failed for ${objectAddress}`, error);
      setChildErrorByParent((previous) => ({
        ...previous,
        [objectAddress]: message,
      }));
    }
  }, [applySceneChildrenTaskState, childTaskByParentRef, repository, setChildErrorByParent, setLoadingChildrenByParent, shouldAcceptChildrenTask]);

  const stopSceneObjectChildrenObservation = useCallback((_objectAddress: string) => {
    return;
  }, []);

  const refreshSceneWorkspace = useCallback(async () => {
    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      return;
    }

    if (sceneWorkspace.refreshStatus === 'refreshing' || sceneWorkspace.resourceState.freshness === 'refreshing') {
      return;
    }

    const startedAt = nowMs();
    updateSceneWorkspace((previous) => ({
      ...previous,
      refreshStatus: 'refreshing',
      errorMessage: null,
      resourceState: {
        ...previous.resourceState,
        freshness: previous.snapshot ? 'refreshing' : previous.resourceState.freshness,
        isRetainingSnapshot: previous.snapshot != null,
        errorMessage: null,
      },
    }));

    try {
      const next = await repository.startSceneRefresh();
      if (!shouldAcceptSceneWorkspace(next)) {
        return;
      }

      updateSceneWorkspace(next);
      logScenePerf('refreshSceneWorkspace', startedAt, {
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
    } catch (error) {
      const message = logSceneError('refreshSceneWorkspace failed', error);
      updateSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
    }
  }, [repository, sceneWorkspace.refreshStatus, sceneWorkspace.resourceState.freshness, shouldAcceptSceneWorkspace, updateSceneWorkspace, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  const loadSceneWorkspaceState = useCallback(async () => {
    const startedAt = nowMs();
    try {
      const next = await repository.getSceneWorkspaceState();
      if (!shouldAcceptSceneWorkspace(next)) {
        return null;
      }

      updateSceneWorkspace(next);
      logScenePerf('getSceneWorkspaceState', startedAt, {
        refreshStatus: next.refreshStatus,
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
      return next;
    } catch (error) {
      const message = logSceneError('getSceneWorkspaceState failed', error);
      updateSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
      return null;
    }
  }, [repository, shouldAcceptSceneWorkspace, updateSceneWorkspace]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let disposed = false;
    let disposeWorkspace: (() => void) | undefined;
    let disposeChildren: (() => void) | undefined;
    let disposeInspector: (() => void) | undefined;

    onSceneWorkspaceStateUpdated((nextWorkspace) => {
      if (disposed || !shouldAcceptSceneWorkspace(nextWorkspace)) {
        return;
      }
      updateSceneWorkspace(nextWorkspace);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeWorkspace = dispose;
    }).catch(() => undefined);

    onSceneObjectChildrenTaskUpdated((taskState) => {
      if (disposed || !shouldAcceptChildrenTask(taskState)) {
        return;
      }

      applySceneChildrenTaskState(taskState);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeChildren = dispose;
    }).catch(() => undefined);

    onSceneObjectInspectorTaskUpdated((taskState) => {
      if (disposed || !shouldAcceptInspectorTask(taskState)) {
        return;
      }

      applyInspectorTaskState(taskState);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeInspector = dispose;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      disposeWorkspace?.();
      disposeChildren?.();
      disposeInspector?.();
    };
  }, [active, applyInspectorTaskState, applySceneChildrenTaskState, shouldAcceptChildrenTask, shouldAcceptInspectorTask, shouldAcceptSceneWorkspace, updateSceneWorkspace]);

  useEffect(() => {
    const processKey = workspaceLifecycle.runtimeSession.sessionKey
      ?? (workspaceLifecycle.processSession
        ? `${workspaceLifecycle.processSession.pid}:${workspaceLifecycle.processSession.processName}`
        : null);

    if (processKeyRef.current !== processKey) {
      processKeyRef.current = processKey;
      resetSceneWorkspaceState();
    }
  }, [processKeyRef, resetSceneWorkspaceState, workspaceLifecycle.processSession, workspaceLifecycle.runtimeSession.sessionKey]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      resetSceneWorkspaceState();
      return;
    }

    loadSceneWorkspaceState().then((state) => {
      if (!state?.snapshot || state.resourceState.freshness === 'empty') {
        refreshSceneWorkspace().catch(() => undefined);
      }
    }).catch(() => undefined);
  }, [active, loadSceneWorkspaceState, refreshSceneWorkspace, resetSceneWorkspaceState, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!selectedObjectAddress || !active) {
      return;
    }

    loadSceneObjectInspector(selectedObjectAddress).catch(() => undefined);
  }, [active, loadSceneObjectInspector, selectedObjectAddress]);

  useEffect(() => {
    if (!active || !selectedObjectAddress) {
      return;
    }

    const currentTask = inspectorTaskByAddressRef.current[selectedObjectAddress];
    if (!currentTask) {
      return;
    }

    if (currentTask.mutationEpoch < sceneWorkspace.mutationEpoch
      || currentTask.isStale
      || currentTask.resourceState.freshness === 'stale'
      || currentTask.resourceState.freshness === 'error'
      || currentTask.resourceState.freshness === 'empty') {
      loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    }
  }, [active, loadSceneObjectInspector, sceneWorkspace.mutationEpoch, selectedObjectAddress, inspectorTaskByAddressRef]);

  return {
    loadSceneObjectInspector,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
    refreshSceneWorkspace,
  };
}