import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RuntimeSceneMutationOperation,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  adjustChildrenCounts,
  adjustInspectorCounts,
  adjustNodeChildCountInList,
  buildInspectorSnapshot,
  EMPTY_SCENE_WORKSPACE_STATE,
  isTerminalChildrenTaskStatus,
  isTerminalInspectorTaskStatus,
  mergeInspectorCaches,
  patchChildrenWithSummaries,
  patchChildrenWithSummary,
  patchInspectorsWithSummaries,
  patchInspectorsWithSummary,
  patchInspectorTransform,
  patchRootsWithSummaries,
  patchRootsWithSummary,
  sameNodeOrder,
} from './sceneWorkspaceStatePatches';
import {
  buildLoadedSceneGraph,
  createLoadedSceneSearchProjection,
  type LoadedSceneGraph,
  type LoadedSceneSearchProjection,
} from './loadedSceneNodes';

export type SceneMutationState = {
  operation: RuntimeSceneMutationOperation | null;
  loading: boolean;
  errorMessage: string | null;
  task: WorkspaceTaskSnapshot | null;
};

export const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
  task: null,
};

export function useSceneWorkspaceStore() {
  const [sceneWorkspace, setSceneWorkspace] = useState<SceneWorkspaceState>(EMPTY_SCENE_WORKSPACE_STATE);
  const [selectedObjectAddress, setSelectedObjectAddress] = useState<string | null>(null);
  const [sceneHierarchySearchQuery, setSceneHierarchySearchQuery] = useState('');
  const [childrenByParent, setChildrenByParent] = useState<Record<string, RuntimeSceneNodeSummary[]>>({});
  const [childTaskByParent, setChildTaskByParent] = useState<Record<string, RuntimeSceneObjectChildrenTaskState>>({});
  const [loadingChildrenByParent, setLoadingChildrenByParent] = useState<Record<string, boolean>>({});
  const [childErrorByParent, setChildErrorByParent] = useState<Record<string, string | null>>({});
  const [inspectorsByAddress, setInspectorsByAddress] = useState<Record<string, RuntimeSceneObjectInspectorSnapshot>>({});
  const [inspectorTaskByAddress, setInspectorTaskByAddress] = useState<Record<string, RuntimeSceneObjectInspectorTaskState>>({});
  const [inspectorLoadingByAddress, setInspectorLoadingByAddress] = useState<Record<string, boolean>>({});
  const [inspectorErrorByAddress, setInspectorErrorByAddress] = useState<Record<string, string | null>>({});
  const [sceneMutationState, setSceneMutationState] = useState<SceneMutationState>(EMPTY_MUTATION_STATE);

  const processKeyRef = useRef<string | null>(null);
  const childrenByParentRef = useRef(childrenByParent);
  const childTaskByParentRef = useRef(childTaskByParent);
  const inspectorsByAddressRef = useRef(inspectorsByAddress);
  const inspectorTaskByAddressRef = useRef(inspectorTaskByAddress);
  const inspectorLoadingByAddressRef = useRef(inspectorLoadingByAddress);
  const childPollTokensRef = useRef<Record<string, number>>({});
  const activeChildTaskIdByParentRef = useRef<Record<string, number | null>>({});
  const activeInspectorTaskIdRef = useRef<number | null>(null);
  const inspectorPollTokenRef = useRef(0);
  const sceneMutationTaskCounterRef = useRef(0);

  useEffect(() => {
    childrenByParentRef.current = childrenByParent;
  }, [childrenByParent]);

  useEffect(() => {
    childTaskByParentRef.current = childTaskByParent;
  }, [childTaskByParent]);

  useEffect(() => {
    inspectorsByAddressRef.current = inspectorsByAddress;
  }, [inspectorsByAddress]);

  useEffect(() => {
    inspectorTaskByAddressRef.current = inspectorTaskByAddress;
  }, [inspectorTaskByAddress]);

  useEffect(() => {
    inspectorLoadingByAddressRef.current = inspectorLoadingByAddress;
  }, [inspectorLoadingByAddress]);

  const deferredSceneHierarchySearchQuery = useDeferredValue(sceneHierarchySearchQuery.trim().toLowerCase());
  const loadedSceneGraph = useMemo(() => buildLoadedSceneGraph(sceneWorkspace, childrenByParent), [childrenByParent, sceneWorkspace]);
  const sceneHierarchySearch = useMemo(() => {
    return createLoadedSceneSearchProjection(loadedSceneGraph, deferredSceneHierarchySearchQuery);
  }, [deferredSceneHierarchySearchQuery, loadedSceneGraph]);

  const resetSceneState = useCallback(() => {
    setSceneWorkspace(EMPTY_SCENE_WORKSPACE_STATE);
    setSelectedObjectAddress(null);
    setSceneHierarchySearchQuery('');
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
    activeInspectorTaskIdRef.current = null;
    inspectorPollTokenRef.current += 1;
  }, []);

  const applySummaryPatch = useCallback((summary: RuntimeSceneNodeSummary) => {
    setSceneWorkspace((previous) => patchRootsWithSummary(previous, summary));
    setChildrenByParent((previous) => patchChildrenWithSummary(previous, summary));
    setInspectorsByAddress((previous) => patchInspectorsWithSummary(previous, summary));
  }, []);

  const applySummaryBatch = useCallback((summaries: RuntimeSceneNodeSummary[]) => {
    if (summaries.length === 0) {
      return;
    }

    setSceneWorkspace((previous) => patchRootsWithSummaries(previous, summaries));
    setChildrenByParent((previous) => patchChildrenWithSummaries(previous, summaries));
    setInspectorsByAddress((previous) => patchInspectorsWithSummaries(previous, summaries));
  }, []);

  const applySceneChildrenTaskState = useCallback((taskState: RuntimeSceneObjectChildrenTaskState) => {
    setChildTaskByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: taskState,
    }));
    setLoadingChildrenByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: !isTerminalChildrenTaskStatus(taskState.status),
    }));
    setChildErrorByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: taskState.errorMessage,
    }));

    startTransition(() => {
      applySummaryBatch(taskState.children);
      setChildrenByParent((previous) => {
        const existing = previous[taskState.parentObjectAddress] ?? [];
        if (sameNodeOrder(existing, taskState.children)) {
          return previous;
        }

        return {
          ...previous,
          [taskState.parentObjectAddress]: taskState.children,
        };
      });
    });
  }, [applySummaryBatch]);

  const applyInspectorTaskState = useCallback((taskState: RuntimeSceneObjectInspectorTaskState) => {
    setInspectorTaskByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: taskState,
    }));
    setInspectorLoadingByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: !isTerminalInspectorTaskStatus(taskState.status),
    }));
    setInspectorErrorByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: taskState.errorMessage,
    }));

    const nextSnapshot = buildInspectorSnapshot(taskState);
    if (!nextSnapshot) {
      return;
    }

    if (nextSnapshot.parent) {
      applySummaryPatch(nextSnapshot.parent);
    }
    applySummaryPatch(nextSnapshot.object);

    startTransition(() => {
      setInspectorsByAddress((previous) => mergeInspectorCaches(previous, nextSnapshot));
      setChildrenByParent((previous) => {
        const existing = previous[taskState.objectAddress] ?? [];
        if (sameNodeOrder(existing, taskState.children)) {
          return previous;
        }

        return {
          ...previous,
          [taskState.objectAddress]: taskState.children,
        };
      });
    });
  }, [applySummaryPatch]);

  const bumpParentChildCount = useCallback((objectAddress: string, delta: number) => {
    setSceneWorkspace((previous) => {
      if (!previous.snapshot) {
        return previous;
      }

      let touched = false;
      const scenes = previous.snapshot.scenes.map((scene) => {
        const roots = adjustNodeChildCountInList(scene.roots, objectAddress, delta);
        if (roots !== scene.roots) {
          touched = true;
          return { ...scene, roots };
        }
        return scene;
      });

      if (!touched) {
        return previous;
      }

      return {
        ...previous,
        snapshot: {
          ...previous.snapshot,
          scenes,
        },
      };
    });
    setChildrenByParent((previous) => adjustChildrenCounts(previous, objectAddress, delta));
    setInspectorsByAddress((previous) => adjustInspectorCounts(previous, objectAddress, delta));
  }, []);

  const sceneInspector = useMemo(() => {
    return selectedObjectAddress ? inspectorsByAddress[selectedObjectAddress] ?? null : null;
  }, [inspectorsByAddress, selectedObjectAddress]);

  const sceneInspectorTaskState = useMemo(() => {
    return selectedObjectAddress ? inspectorTaskByAddress[selectedObjectAddress] ?? null : null;
  }, [inspectorTaskByAddress, selectedObjectAddress]);

  const sceneInspectorLoading = selectedObjectAddress ? inspectorLoadingByAddress[selectedObjectAddress] ?? false : false;
  const sceneInspectorError = selectedObjectAddress ? inspectorErrorByAddress[selectedObjectAddress] ?? null : null;
  const sceneInspectorChildrenLoading = sceneInspectorTaskState != null
    && (sceneInspectorTaskState.status === 'children-loading'
      || (sceneInspectorTaskState.status === 'components-loading'
        && sceneInspectorTaskState.childrenLoadedCount < sceneInspectorTaskState.childrenTotalCount));
  const sceneInspectorComponentsLoading = sceneInspectorTaskState != null
    && (sceneInspectorTaskState.status === 'components-loading'
      || (sceneInspectorTaskState.status === 'children-loading' && sceneInspectorTaskState.componentsTotalCount > 0));

  const sceneRootsByHandle = useMemo(() => {
    return Object.fromEntries((sceneWorkspace.snapshot?.scenes ?? []).map((scene) => [scene.sceneHandle, scene.roots]));
  }, [sceneWorkspace.snapshot]);

  return {
    sceneWorkspace,
    setSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    sceneHierarchySearchQuery,
    setSceneHierarchySearchQuery,
    loadedSceneGraph,
    sceneHierarchySearch,
    childrenByParent,
    setChildrenByParent,
    childTaskByParent,
    setChildTaskByParent,
    loadingChildrenByParent,
    setLoadingChildrenByParent,
    childErrorByParent,
    setChildErrorByParent,
    inspectorsByAddress,
    setInspectorsByAddress,
    inspectorTaskByAddress,
    setInspectorTaskByAddress,
    inspectorLoadingByAddress,
    setInspectorLoadingByAddress,
    inspectorErrorByAddress,
    setInspectorErrorByAddress,
    sceneMutationState,
    setSceneMutationState,
    processKeyRef,
    childrenByParentRef,
    childTaskByParentRef,
    inspectorsByAddressRef,
    inspectorTaskByAddressRef,
    inspectorLoadingByAddressRef,
    childPollTokensRef,
    activeChildTaskIdByParentRef,
    activeInspectorTaskIdRef,
    inspectorPollTokenRef,
    sceneMutationTaskCounterRef,
    resetSceneState,
    applySummaryPatch,
    applySummaryBatch,
    applySceneChildrenTaskState,
    applyInspectorTaskState,
    bumpParentChildCount,
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorError,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneRootsByHandle,
    patchInspectorTransform,
  };
}