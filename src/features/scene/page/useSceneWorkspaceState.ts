import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneCatalogSnapshot,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectInspectorSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { WorkspaceLifecycleState } from '@/shared/contracts';

const EMPTY_SCENE_WORKSPACE_STATE: SceneWorkspaceState = {
  refreshStatus: 'idle',
  errorMessage: null,
  snapshot: null,
  lastUpdatedAt: null,
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logSceneError(context: string, error: unknown) {
  console.log(`[scene] ${context}`, error);
  return toErrorMessage(error);
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function logScenePerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  console.log(`[perf][scene] ${label} completed in ${(nowMs() - startedAt).toFixed(1)}ms`, details ?? {});
}

function snapshotContainsObject(snapshot: RuntimeSceneCatalogSnapshot | null, objectAddress: string | null) {
  if (!snapshot || !objectAddress) {
    return false;
  }

  return snapshot.scenes.some((scene) => scene.roots.some((root) => root.objectAddress === objectAddress));
}

export function useSceneWorkspaceState({
  repository,
  workspaceLifecycle,
  active,
}: {
  repository: AnalysisRepository;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
}) {
  const [sceneWorkspace, setSceneWorkspace] = useState<SceneWorkspaceState>(EMPTY_SCENE_WORKSPACE_STATE);
  const [selectedObjectAddress, setSelectedObjectAddress] = useState<string | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, RuntimeSceneNodeSummary[]>>({});
  const [loadingChildrenByParent, setLoadingChildrenByParent] = useState<Record<string, boolean>>({});
  const [childErrorByParent, setChildErrorByParent] = useState<Record<string, string | null>>({});
  const [sceneInspector, setSceneInspector] = useState<RuntimeSceneObjectInspectorSnapshot | null>(null);
  const [sceneInspectorLoading, setSceneInspectorLoading] = useState(false);
  const [sceneInspectorError, setSceneInspectorError] = useState<string | null>(null);
  const processKeyRef = useRef<string | null>(null);

  const resetSceneState = useCallback(() => {
    setSceneWorkspace(EMPTY_SCENE_WORKSPACE_STATE);
    setSelectedObjectAddress(null);
    setChildrenByParent({});
    setLoadingChildrenByParent({});
    setChildErrorByParent({});
    setSceneInspector(null);
    setSceneInspectorLoading(false);
    setSceneInspectorError(null);
  }, []);

  const refreshSceneWorkspace = useCallback(async () => {
    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      return;
    }

    const startedAt = nowMs();

    setSceneWorkspace((previous) => ({
      ...previous,
      refreshStatus: 'refreshing',
      errorMessage: null,
    }));

    try {
      const next = await repository.startSceneRefresh();
      setSceneWorkspace(next);
      setChildrenByParent({});
      setLoadingChildrenByParent({});
      setChildErrorByParent({});
      setSceneInspector(null);
      setSceneInspectorError(null);
      setSelectedObjectAddress((current) => (snapshotContainsObject(next.snapshot, current) ? current : null));
      logScenePerf('refreshSceneWorkspace', startedAt, {
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
    } catch (error) {
      const message = logSceneError('refreshSceneWorkspace failed', error);
      setSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
    }
  }, [repository, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  const loadSceneWorkspaceState = useCallback(async () => {
    const startedAt = nowMs();
    try {
      const next = await repository.getSceneWorkspaceState();
      setSceneWorkspace(next);
      setSelectedObjectAddress((current) => (snapshotContainsObject(next.snapshot, current) ? current : null));
      logScenePerf('getSceneWorkspaceState', startedAt, {
        refreshStatus: next.refreshStatus,
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
      return next;
    } catch (error) {
      const message = logSceneError('getSceneWorkspaceState failed', error);
      setSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
      return null;
    }
  }, [repository]);

  const ensureSceneObjectChildrenLoaded = useCallback(async (objectAddress: string) => {
    if (childrenByParent[objectAddress] || loadingChildrenByParent[objectAddress]) {
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
      const snapshot: RuntimeSceneChildrenSnapshot = await repository.getSceneObjectChildren(objectAddress);
      setChildrenByParent((previous) => ({
        ...previous,
        [objectAddress]: snapshot.children,
      }));
      logScenePerf(`getSceneObjectChildren:${objectAddress}`, startedAt, {
        childCount: snapshot.children.length,
      });
    } catch (error) {
      const message = logSceneError(`getSceneObjectChildren failed for ${objectAddress}`, error);
      setChildErrorByParent((previous) => ({
        ...previous,
        [objectAddress]: message,
      }));
    } finally {
      setLoadingChildrenByParent((previous) => ({
        ...previous,
        [objectAddress]: false,
      }));
    }
  }, [childrenByParent, loadingChildrenByParent, repository]);

  useEffect(() => {
    const processKey = workspaceLifecycle.processSession
      ? `${workspaceLifecycle.processSession.pid}:${workspaceLifecycle.processSession.processName}`
      : null;

    if (processKeyRef.current !== processKey) {
      processKeyRef.current = processKey;
      resetSceneState();
    }
  }, [resetSceneState, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      resetSceneState();
      return;
    }

    loadSceneWorkspaceState().then((state) => {
      if (!state?.snapshot) {
        refreshSceneWorkspace().catch(() => undefined);
      }
    }).catch(() => undefined);
  }, [active, loadSceneWorkspaceState, refreshSceneWorkspace, resetSceneState, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!selectedObjectAddress || !active) {
      return;
    }

    let cancelled = false;
    const startedAt = nowMs();
    setSceneInspectorLoading(true);
    setSceneInspectorError(null);

    repository
      .getSceneObjectInspector(selectedObjectAddress)
      .then((snapshot) => {
        if (!cancelled) {
          setSceneInspector(snapshot);
          logScenePerf(`getSceneObjectInspector:${selectedObjectAddress}`, startedAt, {
            childCount: snapshot.children.length,
            componentCount: snapshot.components.length,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSceneInspectorError(logSceneError(`getSceneObjectInspector failed for ${selectedObjectAddress}`, error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSceneInspectorLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, repository, selectedObjectAddress]);

  const sceneRootsByHandle = useMemo(() => {
    return Object.fromEntries((sceneWorkspace.snapshot?.scenes ?? []).map((scene) => [scene.sceneHandle, scene.roots]));
  }, [sceneWorkspace.snapshot]);

  return {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    childrenByParent,
    loadingChildrenByParent,
    childErrorByParent,
    ensureSceneObjectChildrenLoaded,
    sceneInspector,
    sceneInspectorLoading,
    sceneInspectorError,
    sceneRootsByHandle,
  };
}