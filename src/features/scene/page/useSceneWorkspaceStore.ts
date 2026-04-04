import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from 'react';
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

export type SceneInspectorTab = {
  objectAddress: string;
  name: string;
  sceneName?: string;
  sceneKind?: string;
};

export type SceneMutationState = {
  operation: RuntimeSceneMutationOperation | null;
  loading: boolean;
  errorMessage: string | null;
  task: WorkspaceTaskSnapshot | null;
  pendingOperations: Partial<Record<RuntimeSceneMutationOperation, number>>;
};

export const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
  task: null,
  pendingOperations: {},
};

type SceneWorkspaceStoreState = {
  sceneWorkspace: SceneWorkspaceState;
  selectedObjectAddress: string | null;
  sceneHierarchySearchQuery: string;
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
  inspectorsByAddress: Record<string, RuntimeSceneObjectInspectorSnapshot>;
  inspectorTaskByAddress: Record<string, RuntimeSceneObjectInspectorTaskState>;
  inspectorLoadingByAddress: Record<string, boolean>;
  inspectorErrorByAddress: Record<string, string | null>;
  sceneMutationState: SceneMutationState;
  sceneTabs: SceneInspectorTab[];
  activeSceneTabIndex: number;
};

type SceneStateUpdater<T> = T | ((previous: T) => T);

type SceneWorkspaceStoreAction =
  | { type: 'reset' }
  | { type: 'setSceneWorkspace'; updater: SceneStateUpdater<SceneWorkspaceState> }
  | { type: 'setSelectedObjectAddress'; updater: SceneStateUpdater<string | null> }
  | { type: 'setSceneHierarchySearchQuery'; updater: SceneStateUpdater<string> }
  | { type: 'setChildrenByParent'; updater: SceneStateUpdater<Record<string, RuntimeSceneNodeSummary[]>> }
  | { type: 'setChildTaskByParent'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectChildrenTaskState>> }
  | { type: 'setLoadingChildrenByParent'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setChildErrorByParent'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setInspectorsByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectInspectorSnapshot>> }
  | { type: 'setInspectorTaskByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectInspectorTaskState>> }
  | { type: 'setInspectorLoadingByAddress'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setInspectorErrorByAddress'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setSceneMutationState'; updater: SceneStateUpdater<SceneMutationState> }
  | { type: 'applySummaryPatch'; summary: RuntimeSceneNodeSummary }
  | { type: 'applySummaryBatch'; summaries: RuntimeSceneNodeSummary[] }
  | { type: 'applySceneChildrenTaskState'; taskState: RuntimeSceneObjectChildrenTaskState }
  | { type: 'applyInspectorTaskState'; taskState: RuntimeSceneObjectInspectorTaskState }
  | { type: 'bumpParentChildCount'; objectAddress: string; delta: number }
  | { type: 'setSceneTabs'; updater: SceneStateUpdater<SceneInspectorTab[]> }
  | { type: 'setActiveSceneTabIndex'; updater: SceneStateUpdater<number> };

const getSavedTabs = () => {
  try {
    const data = sessionStorage.getItem('mndp_scene_tabs');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const getSavedTabIndex = () => {
  try {
    const data = sessionStorage.getItem('mndp_scene_tab_index');
    return data ? Number(data) : -1;
  } catch {
    return -1;
  }
};

const getSavedSelected = () => {
  try {
    const data = sessionStorage.getItem('mndp_scene_selected_address');
    return data ? data : null;
  } catch {
    return null;
  }
};

const EMPTY_SCENE_WORKSPACE_STORE_STATE: SceneWorkspaceStoreState = {
  sceneWorkspace: EMPTY_SCENE_WORKSPACE_STATE,
  selectedObjectAddress: null,
  sceneHierarchySearchQuery: '',
  childrenByParent: {},
  childTaskByParent: {},
  loadingChildrenByParent: {},
  childErrorByParent: {},
  inspectorsByAddress: {},
  inspectorTaskByAddress: {},
  inspectorLoadingByAddress: {},
  inspectorErrorByAddress: {},
  sceneMutationState: EMPTY_MUTATION_STATE,
  sceneTabs: [],
  activeSceneTabIndex: -1,
};

function initSceneWorkspaceStoreState(): SceneWorkspaceStoreState {
  return {
    ...EMPTY_SCENE_WORKSPACE_STORE_STATE,
    sceneTabs: getSavedTabs(),
    activeSceneTabIndex: getSavedTabIndex(),
    selectedObjectAddress: getSavedSelected(),
  };
}

function resolveSceneStateUpdater<T>(previous: T, updater: SceneStateUpdater<T>) {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(previous);
  }

  return updater;
}

function replaceSceneStoreValue<K extends keyof SceneWorkspaceStoreState>(
  state: SceneWorkspaceStoreState,
  key: K,
  nextValue: SceneWorkspaceStoreState[K],
): SceneWorkspaceStoreState {
  if (Object.is(state[key], nextValue)) {
    return state;
  }

  return {
    ...state,
    [key]: nextValue,
  } as SceneWorkspaceStoreState;
}

function patchSummaryCollections(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  inspectorsByAddress: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  summary: RuntimeSceneNodeSummary,
) {
  return {
    sceneWorkspace: patchRootsWithSummary(sceneWorkspace, summary),
    childrenByParent: patchChildrenWithSummary(childrenByParent, summary),
    inspectorsByAddress: patchInspectorsWithSummary(inspectorsByAddress, summary),
  };
}

function patchSummaryBatchCollections(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  inspectorsByAddress: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  summaries: RuntimeSceneNodeSummary[],
) {
  return {
    sceneWorkspace: patchRootsWithSummaries(sceneWorkspace, summaries),
    childrenByParent: patchChildrenWithSummaries(childrenByParent, summaries),
    inspectorsByAddress: patchInspectorsWithSummaries(inspectorsByAddress, summaries),
  };
}

function sceneWorkspaceStoreReducer(
  state: SceneWorkspaceStoreState,
  action: SceneWorkspaceStoreAction,
): SceneWorkspaceStoreState {
  switch (action.type) {
    case 'reset':
      return {
        ...EMPTY_SCENE_WORKSPACE_STORE_STATE,
        selectedObjectAddress: state.selectedObjectAddress,
        sceneTabs: state.sceneTabs,
        activeSceneTabIndex: state.activeSceneTabIndex,
      };
    case 'setSceneWorkspace':
      return replaceSceneStoreValue(
        state,
        'sceneWorkspace',
        resolveSceneStateUpdater(state.sceneWorkspace, action.updater),
      );
    case 'setSelectedObjectAddress': {
      const nextAddress = resolveSceneStateUpdater(state.selectedObjectAddress, action.updater);
      if (nextAddress) {
        sessionStorage.setItem('mndp_scene_selected_address', nextAddress);
      } else {
        sessionStorage.removeItem('mndp_scene_selected_address');
      }
      return replaceSceneStoreValue(state, 'selectedObjectAddress', nextAddress);
    }
    case 'setSceneHierarchySearchQuery':
      return replaceSceneStoreValue(
        state,
        'sceneHierarchySearchQuery',
        resolveSceneStateUpdater(state.sceneHierarchySearchQuery, action.updater),
      );
    case 'setChildrenByParent':
      return replaceSceneStoreValue(
        state,
        'childrenByParent',
        resolveSceneStateUpdater(state.childrenByParent, action.updater),
      );
    case 'setChildTaskByParent':
      return replaceSceneStoreValue(
        state,
        'childTaskByParent',
        resolveSceneStateUpdater(state.childTaskByParent, action.updater),
      );
    case 'setLoadingChildrenByParent':
      return replaceSceneStoreValue(
        state,
        'loadingChildrenByParent',
        resolveSceneStateUpdater(state.loadingChildrenByParent, action.updater),
      );
    case 'setChildErrorByParent':
      return replaceSceneStoreValue(
        state,
        'childErrorByParent',
        resolveSceneStateUpdater(state.childErrorByParent, action.updater),
      );
    case 'setInspectorsByAddress':
      return replaceSceneStoreValue(
        state,
        'inspectorsByAddress',
        resolveSceneStateUpdater(state.inspectorsByAddress, action.updater),
      );
    case 'setInspectorTaskByAddress':
      return replaceSceneStoreValue(
        state,
        'inspectorTaskByAddress',
        resolveSceneStateUpdater(state.inspectorTaskByAddress, action.updater),
      );
    case 'setInspectorLoadingByAddress':
      return replaceSceneStoreValue(
        state,
        'inspectorLoadingByAddress',
        resolveSceneStateUpdater(state.inspectorLoadingByAddress, action.updater),
      );
    case 'setInspectorErrorByAddress':
      return replaceSceneStoreValue(
        state,
        'inspectorErrorByAddress',
        resolveSceneStateUpdater(state.inspectorErrorByAddress, action.updater),
      );
    case 'setSceneMutationState':
      return replaceSceneStoreValue(
        state,
        'sceneMutationState',
        resolveSceneStateUpdater(state.sceneMutationState, action.updater),
      );
    case 'setSceneTabs': {
      const nextTabs = resolveSceneStateUpdater(state.sceneTabs, action.updater);
      sessionStorage.setItem('mndp_scene_tabs', JSON.stringify(nextTabs));
      return replaceSceneStoreValue(state, 'sceneTabs', nextTabs);
    }
    case 'setActiveSceneTabIndex': {
      const nextIndex = resolveSceneStateUpdater(state.activeSceneTabIndex, action.updater);
      sessionStorage.setItem('mndp_scene_tab_index', String(nextIndex));
      return replaceSceneStoreValue(state, 'activeSceneTabIndex', nextIndex);
    }
    case 'applySummaryPatch': {
      const next = patchSummaryCollections(
        state.sceneWorkspace,
        state.childrenByParent,
        state.inspectorsByAddress,
        action.summary,
      );

      return {
        ...state,
        ...next,
      };
    }
    case 'applySummaryBatch': {
      if (action.summaries.length === 0) {
        return state;
      }

      const next = patchSummaryBatchCollections(
        state.sceneWorkspace,
        state.childrenByParent,
        state.inspectorsByAddress,
        action.summaries,
      );

      return {
        ...state,
        ...next,
      };
    }
    case 'applySceneChildrenTaskState': {
      const { taskState } = action;
      const patched = patchSummaryBatchCollections(
        state.sceneWorkspace,
        state.childrenByParent,
        state.inspectorsByAddress,
        taskState.children,
      );
      const existing = patched.childrenByParent[taskState.parentObjectAddress] ?? [];
      const nextChildrenByParent = sameNodeOrder(existing, taskState.children)
        ? patched.childrenByParent
        : {
            ...patched.childrenByParent,
            [taskState.parentObjectAddress]: taskState.children,
          };

      return {
        ...state,
        sceneWorkspace: patched.sceneWorkspace,
        childrenByParent: nextChildrenByParent,
        childTaskByParent: {
          ...state.childTaskByParent,
          [taskState.parentObjectAddress]: taskState,
        },
        loadingChildrenByParent: {
          ...state.loadingChildrenByParent,
          [taskState.parentObjectAddress]: !isTerminalChildrenTaskStatus(taskState.status),
        },
        childErrorByParent: {
          ...state.childErrorByParent,
          [taskState.parentObjectAddress]: taskState.errorMessage,
        },
        inspectorsByAddress: patched.inspectorsByAddress,
      };
    }
    case 'applyInspectorTaskState': {
      const { taskState } = action;
      const nextSnapshot = buildInspectorSnapshot(taskState);
      if (!nextSnapshot) {
        return {
          ...state,
          inspectorTaskByAddress: {
            ...state.inspectorTaskByAddress,
            [taskState.objectAddress]: taskState,
          },
          inspectorLoadingByAddress: {
            ...state.inspectorLoadingByAddress,
            [taskState.objectAddress]: !isTerminalInspectorTaskStatus(taskState.status),
          },
          inspectorErrorByAddress: {
            ...state.inspectorErrorByAddress,
            [taskState.objectAddress]: taskState.errorMessage,
          },
        };
      }

      let nextSceneWorkspace = state.sceneWorkspace;
      let nextChildrenByParent = state.childrenByParent;
      let nextInspectorsByAddress = state.inspectorsByAddress;

      if (nextSnapshot.parent) {
        const patchedParent = patchSummaryCollections(
          nextSceneWorkspace,
          nextChildrenByParent,
          nextInspectorsByAddress,
          nextSnapshot.parent,
        );
        nextSceneWorkspace = patchedParent.sceneWorkspace;
        nextChildrenByParent = patchedParent.childrenByParent;
        nextInspectorsByAddress = patchedParent.inspectorsByAddress;
      }

      const patchedObject = patchSummaryCollections(
        nextSceneWorkspace,
        nextChildrenByParent,
        nextInspectorsByAddress,
        nextSnapshot.object,
      );
      nextSceneWorkspace = patchedObject.sceneWorkspace;
      nextChildrenByParent = patchedObject.childrenByParent;
      nextInspectorsByAddress = mergeInspectorCaches(patchedObject.inspectorsByAddress, nextSnapshot);

      const existing = nextChildrenByParent[taskState.objectAddress] ?? [];
      if (!sameNodeOrder(existing, taskState.children)) {
        nextChildrenByParent = {
          ...nextChildrenByParent,
          [taskState.objectAddress]: taskState.children,
        };
      }

      return {
        ...state,
        sceneWorkspace: nextSceneWorkspace,
        childrenByParent: nextChildrenByParent,
        inspectorsByAddress: nextInspectorsByAddress,
        inspectorTaskByAddress: {
          ...state.inspectorTaskByAddress,
          [taskState.objectAddress]: taskState,
        },
        inspectorLoadingByAddress: {
          ...state.inspectorLoadingByAddress,
          [taskState.objectAddress]: !isTerminalInspectorTaskStatus(taskState.status),
        },
        inspectorErrorByAddress: {
          ...state.inspectorErrorByAddress,
          [taskState.objectAddress]: taskState.errorMessage,
        },
      };
    }
    case 'bumpParentChildCount': {
      if (!state.sceneWorkspace.snapshot) {
        return state;
      }

      let touched = false;
      const scenes = state.sceneWorkspace.snapshot.scenes.map((scene) => {
        const roots = adjustNodeChildCountInList(scene.roots, action.objectAddress, action.delta);
        if (roots !== scene.roots) {
          touched = true;
          return { ...scene, roots };
        }
        return scene;
      });

      return {
        ...state,
        sceneWorkspace: touched
          ? {
              ...state.sceneWorkspace,
              snapshot: {
                ...state.sceneWorkspace.snapshot,
                scenes,
              },
            }
          : state.sceneWorkspace,
        childrenByParent: adjustChildrenCounts(state.childrenByParent, action.objectAddress, action.delta),
        inspectorsByAddress: adjustInspectorCounts(state.inspectorsByAddress, action.objectAddress, action.delta),
      };
    }
    default:
      return state;
  }
}

export function useSceneWorkspaceStore() {
  const [state, dispatch] = useReducer(
    sceneWorkspaceStoreReducer, 
    EMPTY_SCENE_WORKSPACE_STORE_STATE, 
    initSceneWorkspaceStoreState
  );
  const {
    sceneWorkspace,
    selectedObjectAddress,
    sceneHierarchySearchQuery,
    childrenByParent,
    childTaskByParent,
    loadingChildrenByParent,
    childErrorByParent,
    inspectorsByAddress,
    inspectorTaskByAddress,
    inspectorLoadingByAddress,
    inspectorErrorByAddress,
    sceneMutationState,
    sceneTabs,
    activeSceneTabIndex,
  } = state;

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
  
  const selectedObjectAddressRef = useRef(selectedObjectAddress);
  useEffect(() => {
    selectedObjectAddressRef.current = selectedObjectAddress;
  }, [selectedObjectAddress]);

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

  const setSceneWorkspace = useCallback((updater: SceneStateUpdater<SceneWorkspaceState>) => {
    dispatch({ type: 'setSceneWorkspace', updater });
  }, []);

  const setSelectedObjectAddress = useCallback((updater: SceneStateUpdater<string | null>) => {
    dispatch({ type: 'setSelectedObjectAddress', updater });
  }, []);

  const setSceneHierarchySearchQuery = useCallback((updater: SceneStateUpdater<string>) => {
    dispatch({ type: 'setSceneHierarchySearchQuery', updater });
  }, []);

  const setChildrenByParent = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneNodeSummary[]>>) => {
    dispatch({ type: 'setChildrenByParent', updater });
  }, []);

  const setChildTaskByParent = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectChildrenTaskState>>) => {
    dispatch({ type: 'setChildTaskByParent', updater });
  }, []);

  const setLoadingChildrenByParent = useCallback((updater: SceneStateUpdater<Record<string, boolean>>) => {
    dispatch({ type: 'setLoadingChildrenByParent', updater });
  }, []);

  const setChildErrorByParent = useCallback((updater: SceneStateUpdater<Record<string, string | null>>) => {
    dispatch({ type: 'setChildErrorByParent', updater });
  }, []);

  const setInspectorsByAddress = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectInspectorSnapshot>>) => {
    dispatch({ type: 'setInspectorsByAddress', updater });
  }, []);

  const setInspectorTaskByAddress = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectInspectorTaskState>>) => {
    dispatch({ type: 'setInspectorTaskByAddress', updater });
  }, []);

  const setInspectorLoadingByAddress = useCallback((updater: SceneStateUpdater<Record<string, boolean>>) => {
    dispatch({ type: 'setInspectorLoadingByAddress', updater });
  }, []);

  const setInspectorErrorByAddress = useCallback((updater: SceneStateUpdater<Record<string, string | null>>) => {
    dispatch({ type: 'setInspectorErrorByAddress', updater });
  }, []);

  const setSceneMutationState = useCallback((updater: SceneStateUpdater<SceneMutationState>) => {
    dispatch({ type: 'setSceneMutationState', updater });
  }, []);

  const setSceneTabs = useCallback((updater: SceneStateUpdater<SceneInspectorTab[]>) => {
    dispatch({ type: 'setSceneTabs', updater });
  }, []);

  const setActiveSceneTabIndex = useCallback((updater: SceneStateUpdater<number>) => {
    dispatch({ type: 'setActiveSceneTabIndex', updater });
  }, []);

  const resetSceneState = useCallback(() => {
    dispatch({ type: 'reset' });
    childPollTokensRef.current = {};
    activeChildTaskIdByParentRef.current = {};
    activeInspectorTaskIdRef.current = null;
    inspectorPollTokenRef.current += 1;
  }, []);

  const applySummaryPatch = useCallback((summary: RuntimeSceneNodeSummary) => {
    dispatch({ type: 'applySummaryPatch', summary });
  }, []);

  const applySummaryBatch = useCallback((summaries: RuntimeSceneNodeSummary[]) => {
    if (summaries.length === 0) {
      return;
    }

    dispatch({ type: 'applySummaryBatch', summaries });
  }, []);

  const applySceneChildrenTaskState = useCallback((taskState: RuntimeSceneObjectChildrenTaskState) => {
    startTransition(() => {
      dispatch({ type: 'applySceneChildrenTaskState', taskState });
    });
  }, []);

  const applyInspectorTaskState = useCallback((taskState: RuntimeSceneObjectInspectorTaskState) => {
    startTransition(() => {
      dispatch({ type: 'applyInspectorTaskState', taskState });
    });
  }, []);

  const bumpParentChildCount = useCallback((objectAddress: string, delta: number) => {
    dispatch({ type: 'bumpParentChildCount', objectAddress, delta });
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
    sceneTabs,
    setSceneTabs,
    activeSceneTabIndex,
    setActiveSceneTabIndex,
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