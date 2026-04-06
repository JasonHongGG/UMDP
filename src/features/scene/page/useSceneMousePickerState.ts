import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMouseTargetHit,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { onSceneMousePickerStateUpdated } from '@/infrastructure/tauri/TauriSceneEvents';
import { recommendScenePickerWindow } from './sceneMousePickerWindows';

const EMPTY_SCENE_MOUSE_PICKER_STATE: RuntimeSceneMousePickerSnapshot = {
  resourceRevision: 0,
  sessionKey: null,
  status: 'idle',
  statusDetail: null,
  isRunning: false,
  targetWindow: null,
  cursorScreenPosition: null,
  cursorClientPosition: null,
  cursorInsideClient: false,
  currentCandidate: null,
  committedPick: null,
  recentPicks: [],
  lastUpdatedAt: null,
  errorMessage: null,
};

function normalizeSceneMousePickerError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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
  openSceneMousePickHit: (hit: RuntimeSceneMouseTargetHit) => void;
}

export function useSceneMousePickerState({
  repository,
  workspaceLifecycle,
  active,
  onPickHit,
}: {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
  onPickHit: (hit: RuntimeSceneMouseTargetHit) => void;
}): SceneMousePickerStateResult {
  const [scenePickerWindows, setScenePickerWindows] = useState<ProcessWindowCandidate[]>([]);
  const [scenePickerWindowsLoading, setScenePickerWindowsLoading] = useState(false);
  const [scenePickerWindowsError, setScenePickerWindowsError] = useState<string | null>(null);
  const [sceneMousePickerState, setSceneMousePickerState] = useState<RuntimeSceneMousePickerSnapshot>(EMPTY_SCENE_MOUSE_PICKER_STATE);

  const currentSessionKey = workspaceLifecycle.runtimeSession.sessionKey ?? null;
  const attachedProcessId = workspaceLifecycle.processSession?.pid ?? null;
  const hasAttachedSceneProcess = attachedProcessId != null && workspaceLifecycle.hasSnapshot;
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  const handledPickKeyRef = useRef<string | null>(null);
  const autoTargetedSessionKeyRef = useRef<string | null>(null);
  const latestPickerRevisionRef = useRef(0);

  useEffect(() => {
    currentSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  useEffect(() => {
    handledPickKeyRef.current = null;
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
    if (!matchesCurrentSceneSession(nextState.sessionKey)) {
      return;
    }

    if (nextState.resourceRevision < latestPickerRevisionRef.current) {
      return;
    }

    latestPickerRevisionRef.current = nextState.resourceRevision;
    setSceneMousePickerState(nextState);
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

  const openSceneMousePickHit = useCallback((hit: RuntimeSceneMouseTargetHit) => {
    onPickHit(hit);
  }, [onPickHit]);

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

  useEffect(() => {
    const committedPick = sceneMousePickerState.committedPick;
    if (!committedPick) {
      return;
    }

    const pickKey = `${committedPick.objectAddress}:${committedPick.observedAt}`;
    if (handledPickKeyRef.current === pickKey) {
      return;
    }

    handledPickKeyRef.current = pickKey;
    onPickHit(committedPick);
  }, [onPickHit, sceneMousePickerState.committedPick]);

  return {
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
    openSceneMousePickHit,
  };
}