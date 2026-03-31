import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneTransformUpdate,
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
  waitForNextPaint,
} from './sceneWorkspaceStatePatches';
import { EMPTY_MUTATION_STATE, type SceneMutationState } from './useSceneWorkspaceStore';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

interface UseSceneWorkspaceSyncOptions {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
  selectedObjectAddress: string | null;
  setSceneWorkspace: Dispatch<SetStateAction<SceneWorkspaceState>>;
  setChildrenByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneNodeSummary[]>>>;
  setChildTaskByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectChildrenTaskState>>>;
  setLoadingChildrenByParent: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChildErrorByParent: Dispatch<SetStateAction<Record<string, string | null>>>;
  setInspectorsByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectInspectorSnapshot>>>;
  setInspectorTaskByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectInspectorTaskState>>>;
  setInspectorLoadingByAddress: Dispatch<SetStateAction<Record<string, boolean>>>;
  setInspectorErrorByAddress: Dispatch<SetStateAction<Record<string, string | null>>>;
  setSceneMutationState: Dispatch<SetStateAction<SceneMutationState>>;
  processKeyRef: MutableRefObject<string | null>;
  childTaskByParentRef: MutableRefObject<Record<string, RuntimeSceneObjectChildrenTaskState>>;
  inspectorTaskByAddressRef: MutableRefObject<Record<string, RuntimeSceneObjectInspectorTaskState>>;
  childPollTokensRef: MutableRefObject<Record<string, number>>;
  activeChildTaskIdByParentRef: MutableRefObject<Record<string, number | null>>;
  activeInspectorTaskIdRef: MutableRefObject<number | null>;
  inspectorPollTokenRef: MutableRefObject<number>;
  resetSceneState: () => void;
  applySceneChildrenTaskState: (taskState: RuntimeSceneObjectChildrenTaskState) => void;
  applyInspectorTaskState: (taskState: RuntimeSceneObjectInspectorTaskState) => void;
}

export function useSceneWorkspaceSync({
  repository,
  workspaceLifecycle,
  active,
  selectedObjectAddress,
  setSceneWorkspace,
  setChildrenByParent,
  setChildTaskByParent,
  setLoadingChildrenByParent,
  setChildErrorByParent,
  setInspectorsByAddress,
  setInspectorTaskByAddress,
  setInspectorLoadingByAddress,
  setInspectorErrorByAddress,
  setSceneMutationState,
  processKeyRef,
  childTaskByParentRef,
  inspectorTaskByAddressRef,
  childPollTokensRef,
  activeChildTaskIdByParentRef,
  activeInspectorTaskIdRef,
  inspectorPollTokenRef,
  resetSceneState,
  applySceneChildrenTaskState,
  applyInspectorTaskState,
}: UseSceneWorkspaceSyncOptions) {
  const currentSceneSessionKey = workspaceLifecycle.runtimeSession.sessionKey ?? null;
  const currentSceneSessionKeyRef = useRef<string | null>(currentSceneSessionKey);
  const latestSceneWorkspaceRevisionRef = useRef(0);

  useEffect(() => {
    currentSceneSessionKeyRef.current = currentSceneSessionKey;
  }, [currentSceneSessionKey]);

  const updateSceneWorkspace = useCallback((nextState: SetStateAction<SceneWorkspaceState>) => {
    setSceneWorkspace((previous) => {
      const resolved = typeof nextState === 'function'
        ? nextState(previous)
        : nextState;
      latestSceneWorkspaceRevisionRef.current = resolved.resourceRevision;
      return resolved;
    });
  }, [setSceneWorkspace]);

  const resetSceneWorkspaceState = useCallback(() => {
    latestSceneWorkspaceRevisionRef.current = 0;
    resetSceneState();
  }, [resetSceneState]);

  const matchesCurrentSceneSession = useCallback((sessionKey: string | null | undefined) => {
    return (sessionKey ?? null) === currentSceneSessionKeyRef.current;
  }, []);

  const shouldAcceptSceneWorkspace = useCallback((workspace: SceneWorkspaceState) => {
    return matchesCurrentSceneSession(workspace.sessionKey)
      && workspace.resourceRevision >= latestSceneWorkspaceRevisionRef.current;
  }, [matchesCurrentSceneSession]);

  const loadSceneObjectInspector = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = inspectorTaskByAddressRef.current[objectAddress];
    if (!force && currentTask && !isTerminalInspectorTaskStatus(currentTask.status)) {
      return;
    }

    const startedAt = nowMs();
    const pollToken = inspectorPollTokenRef.current + 1;
    inspectorPollTokenRef.current = pollToken;
    activeInspectorTaskIdRef.current = null;
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
      if (inspectorPollTokenRef.current !== pollToken || !taskState) {
        return;
      }

      activeInspectorTaskIdRef.current = taskState.taskId;
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
  }, [activeInspectorTaskIdRef, applyInspectorTaskState, inspectorPollTokenRef, inspectorTaskByAddressRef, repository, setInspectorErrorByAddress, setInspectorLoadingByAddress]);

  const ensureSceneObjectChildrenLoaded = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = childTaskByParentRef.current[objectAddress];
    if (!force && currentTask && !isTerminalChildrenTaskStatus(currentTask.status)) {
      return;
    }
    if (!force && currentTask?.status === 'ready' && currentTask.loadedCount >= currentTask.totalCount) {
      return;
    }

    const startedAt = nowMs();
    const pollToken = (childPollTokensRef.current[objectAddress] ?? 0) + 1;
    childPollTokensRef.current[objectAddress] = pollToken;
    activeChildTaskIdByParentRef.current[objectAddress] = null;
    setLoadingChildrenByParent((previous) => ({
      ...previous,
      [objectAddress]: true,
    }));
    setChildErrorByParent((previous) => ({
      ...previous,
      [objectAddress]: null,
    }));

    try {
      await waitForNextPaint();
      const taskState = await repository.startSceneObjectChildrenAnalysis(objectAddress);
      if ((childPollTokensRef.current[objectAddress] ?? 0) !== pollToken || !taskState) {
        return;
      }

      activeChildTaskIdByParentRef.current[objectAddress] = taskState.taskId;
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
  }, [activeChildTaskIdByParentRef, applySceneChildrenTaskState, childPollTokensRef, childTaskByParentRef, repository, setChildErrorByParent, setLoadingChildrenByParent]);

  const stopSceneObjectChildrenObservation = useCallback((objectAddress: string) => {
    childPollTokensRef.current[objectAddress] = (childPollTokensRef.current[objectAddress] ?? 0) + 1;
    delete activeChildTaskIdByParentRef.current[objectAddress];
    setChildTaskByParent((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, objectAddress)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectAddress];
      return next;
    });
    setLoadingChildrenByParent((previous) => {
      if (!previous[objectAddress]) {
        return previous;
      }

      return {
        ...previous,
        [objectAddress]: false,
      };
    });
  }, [activeChildTaskIdByParentRef, childPollTokensRef, setChildTaskByParent, setLoadingChildrenByParent]);

  const refreshSceneWorkspace = useCallback(async () => {
    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      return;
    }

    const startedAt = nowMs();
    updateSceneWorkspace((previous) => ({
      ...previous,
      refreshStatus: 'refreshing',
      errorMessage: null,
    }));

    try {
      const next = await repository.startSceneRefresh();
      if (!shouldAcceptSceneWorkspace(next)) {
        return;
      }

      updateSceneWorkspace(next);
      setChildrenByParent({});
      setChildTaskByParent({});
      setLoadingChildrenByParent({});
      setChildErrorByParent({});
      setInspectorsByAddress({});
      setInspectorTaskByAddress({});
      setInspectorLoadingByAddress({});
      setInspectorErrorByAddress({});
      setSceneMutationState(EMPTY_MUTATION_STATE);
      childPollTokensRef.current = {};
      activeChildTaskIdByParentRef.current = {};
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
  }, [activeChildTaskIdByParentRef, childPollTokensRef, repository, setChildErrorByParent, setChildTaskByParent, setChildrenByParent, setInspectorErrorByAddress, setInspectorLoadingByAddress, setInspectorTaskByAddress, setInspectorsByAddress, setLoadingChildrenByParent, setSceneMutationState, shouldAcceptSceneWorkspace, updateSceneWorkspace, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

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
      if (disposed || !matchesCurrentSceneSession(taskState.sessionKey)) {
        return;
      }

      const activeTaskId = activeChildTaskIdByParentRef.current[taskState.parentObjectAddress];
      if (activeTaskId == null || taskState.taskId !== activeTaskId) {
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
      if (disposed || !matchesCurrentSceneSession(taskState.sessionKey)) {
        return;
      }

      if (activeInspectorTaskIdRef.current == null || taskState.taskId !== activeInspectorTaskIdRef.current) {
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
  }, [active, activeChildTaskIdByParentRef, activeInspectorTaskIdRef, applyInspectorTaskState, applySceneChildrenTaskState, matchesCurrentSceneSession, shouldAcceptSceneWorkspace, updateSceneWorkspace]);

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
      if (!state?.snapshot) {
        refreshSceneWorkspace().catch(() => undefined);
      }
    }).catch(() => undefined);
  }, [active, loadSceneWorkspaceState, refreshSceneWorkspace, resetSceneWorkspaceState, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!selectedObjectAddress || !active) {
      return;
    }

    loadSceneObjectInspector(selectedObjectAddress).catch(() => undefined);
    return () => {
      inspectorPollTokenRef.current += 1;
      const activeTaskId = activeInspectorTaskIdRef.current;
      activeInspectorTaskIdRef.current = null;
      if (activeTaskId != null) {
        repository.cancelSceneObjectInspectorAnalysis(activeTaskId).catch(() => undefined);
      }
    };
  }, [active, activeInspectorTaskIdRef, inspectorPollTokenRef, loadSceneObjectInspector, repository, selectedObjectAddress]);

  return {
    loadSceneObjectInspector,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
    refreshSceneWorkspace,
  };
}