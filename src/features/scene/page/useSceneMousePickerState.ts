import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneMousePickerSnapshot,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { onSceneMousePickerStateUpdated } from '@/infrastructure/tauri/TauriSceneEvents';
import { recommendScenePickerWindow } from './sceneMousePickerWindows';
import { EMPTY_SCENE_MOUSE_PICKER_STATE } from './useSceneWorkspaceStore';

const MAX_RECENT_SCENE_MOUSE_HITS = 5;

function normalizeSceneMousePickerError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeSceneMousePickerSnapshot(nextState: RuntimeSceneMousePickerSnapshot): RuntimeSceneMousePickerSnapshot {
  const recentHits: RuntimeSceneMousePickerSnapshot['recentHits'] = [];
  const seenObjectAddresses = new Set<string>();

  nextState.recentHits.forEach((hit) => {
    const objectAddress = hit.objectAddress.trim();
    if (!objectAddress || seenObjectAddresses.has(objectAddress)) {
      return;
    }

    seenObjectAddresses.add(objectAddress);
    recentHits.push(hit);
  });

  return {
    ...nextState,
    recentHits: recentHits.slice(0, MAX_RECENT_SCENE_MOUSE_HITS),
  };
}

export interface SceneMousePickerStateResult {
  scenePickerWindows: ProcessWindowCandidate[];
  scenePickerWindowsLoading: boolean;
  scenePickerWindowsError: string | null;
  sceneMousePickerState: RuntimeSceneMousePickerSnapshot;
  refreshScenePickerWindows: () => Promise<ProcessWindowCandidate[]>;
  setSceneMousePickerTarget: (windowHandle: string | null) => Promise<void>;
  startSceneMousePicker: () => Promise<void>;
  stopSceneMousePicker: () => Promise<void>;
}

export function useSceneMousePickerState({
  repository,
  workspaceLifecycle,
  active,
  scenePickerWindows,
  setScenePickerWindows,
  scenePickerWindowsLoading,
  setScenePickerWindowsLoading,
  scenePickerWindowsError,
  setScenePickerWindowsError,
  sceneMousePickerState,
  setSceneMousePickerState,
}: {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
  scenePickerWindows: ProcessWindowCandidate[];
  setScenePickerWindows: Dispatch<SetStateAction<ProcessWindowCandidate[]>>;
  scenePickerWindowsLoading: boolean;
  setScenePickerWindowsLoading: Dispatch<SetStateAction<boolean>>;
  scenePickerWindowsError: string | null;
  setScenePickerWindowsError: Dispatch<SetStateAction<string | null>>;
  sceneMousePickerState: RuntimeSceneMousePickerSnapshot;
  setSceneMousePickerState: Dispatch<SetStateAction<RuntimeSceneMousePickerSnapshot>>;
}): SceneMousePickerStateResult {
  const currentSessionKey = workspaceLifecycle.runtimeSession.sessionKey ?? null;
  const attachedProcessId = workspaceLifecycle.processSession?.pid ?? null;
  const hasAttachedSceneProcess = attachedProcessId != null && workspaceLifecycle.hasSnapshot;
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  const autoTargetedSessionKeyRef = useRef<string | null>(null);
  const latestPickerRevisionRef = useRef(0);

  useEffect(() => {
    currentSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  useEffect(() => {
    autoTargetedSessionKeyRef.current = null;
    latestPickerRevisionRef.current = 0;
    setScenePickerWindows([]);
    setScenePickerWindowsError(null);
    setSceneMousePickerState({
      ...EMPTY_SCENE_MOUSE_PICKER_STATE,
      sessionKey: currentSessionKey,
    });
  }, [currentSessionKey]);

  const matchesCurrentSceneSession = useCallback((sessionKey: string | null | undefined) => {
    return (sessionKey ?? null) === currentSessionKeyRef.current;
  }, []);

  const applySceneMousePickerState = useCallback((nextState: RuntimeSceneMousePickerSnapshot) => {
    const normalizedState = normalizeSceneMousePickerSnapshot(nextState);

    if (!matchesCurrentSceneSession(normalizedState.sessionKey)) {
      return;
    }

    if (normalizedState.resourceRevision < latestPickerRevisionRef.current) {
      return;
    }

    latestPickerRevisionRef.current = normalizedState.resourceRevision;
    setSceneMousePickerState(normalizedState);
  }, [matchesCurrentSceneSession]);

  const applySceneMousePickerError = useCallback((message: string) => {
    setSceneMousePickerState((previous) => ({
      ...previous,
      status: 'error',
      statusDetail: message,
      errorMessage: message,
      isRunning: false,
    }));
  }, []);

  const refreshScenePickerWindows = useCallback(async () => {
    if (!hasAttachedSceneProcess) {
      setScenePickerWindows([]);
      return [];
    }

    setScenePickerWindowsLoading(true);
    setScenePickerWindowsError(null);
    try {
      const windows = await repository.listScenePickerWindows();
      setScenePickerWindows(windows);
      return windows;
    } catch (error) {
      const message = normalizeSceneMousePickerError(error);
      setScenePickerWindowsError(message);
      return [];
    } finally {
      setScenePickerWindowsLoading(false);
    }
  }, [hasAttachedSceneProcess, repository]);

  const setSceneMousePickerTarget = useCallback(async (windowHandle: string | null) => {
    try {
      const nextState = await repository.setSceneMousePickerTarget(windowHandle);
      applySceneMousePickerState(nextState);
    } catch (error) {
      applySceneMousePickerError(normalizeSceneMousePickerError(error));
      throw error;
    }
  }, [applySceneMousePickerError, applySceneMousePickerState, repository]);

  const startSceneMousePicker = useCallback(async () => {
    try {
      const nextState = await repository.startSceneMousePicker();
      applySceneMousePickerState(nextState);
    } catch (error) {
      applySceneMousePickerError(normalizeSceneMousePickerError(error));
      throw error;
    }
  }, [applySceneMousePickerError, applySceneMousePickerState, repository]);

  const stopSceneMousePicker = useCallback(async () => {
    try {
      const nextState = await repository.stopSceneMousePicker();
      applySceneMousePickerState(nextState);
    } catch (error) {
      applySceneMousePickerError(normalizeSceneMousePickerError(error));
      throw error;
    }
  }, [applySceneMousePickerError, applySceneMousePickerState, repository]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let disposed = false;
    let disposePicker: (() => void) | undefined;

    onSceneMousePickerStateUpdated((nextState) => {
      if (disposed) {
        return;
      }

      applySceneMousePickerState(nextState);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }

      disposePicker = dispose;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      disposePicker?.();
    };
  }, [active, applySceneMousePickerState]);

  useEffect(() => {
    if (!active) {
      repository.stopSceneMousePicker().catch(() => undefined);
      return;
    }

    if (!hasAttachedSceneProcess) {
      return;
    }

    Promise.all([
      repository.getSceneMousePickerState(),
      refreshScenePickerWindows(),
    ]).then(([pickerState]) => {
      applySceneMousePickerState(pickerState);
    }).catch(() => undefined);
  }, [active, applySceneMousePickerState, hasAttachedSceneProcess, refreshScenePickerWindows, repository, currentSessionKey]);

  useEffect(() => {
    if (!active || scenePickerWindowsLoading || sceneMousePickerState.targetWindow || !currentSessionKey) {
      return;
    }

    if (autoTargetedSessionKeyRef.current === currentSessionKey) {
      return;
    }

    const recommendedWindow = recommendScenePickerWindow(scenePickerWindows);
    if (!recommendedWindow) {
      return;
    }

    autoTargetedSessionKeyRef.current = currentSessionKey;
    setSceneMousePickerTarget(recommendedWindow.windowHandle).catch(() => {
      autoTargetedSessionKeyRef.current = null;
    });
  }, [active, currentSessionKey, sceneMousePickerState.targetWindow, scenePickerWindows, scenePickerWindowsLoading, setSceneMousePickerTarget]);

  return {
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
  };
}