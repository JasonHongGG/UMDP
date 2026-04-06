import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  RuntimeSceneComponentSummary,
  RuntimeSceneMutationOperation,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  adjustChildrenCounts,
  adjustInspectorCounts,
  adjustNodeChildCountInList,
  buildInspectorSnapshot,
  EMPTY_SCENE_WORKSPACE_STATE,
  isTerminalComponentsTaskStatus,
  isTerminalChildrenTaskStatus,
  isTerminalHeaderTaskStatus,
  mergeInspectorCaches,
  patchChildrenWithSummaries,
  patchChildrenWithSummary,
  patchInspectorsWithSummaries,
  patchInspectorsWithSummary,
  patchInspectorTransform,
  patchRootsWithSummaries,
  patchRootsWithSummary,
  sameComponentOrder,
  sameNodeOrder,
  syncInspectorComponentCount,
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

export type SceneObjectActiveIntentState = {
  desiredActiveSelf: boolean;
  status: 'queued' | 'running';
};

export type SceneInspectorComponentsPanelState = {
  objectAddress: string;
  components: RuntimeSceneComponentSummary[];
  totalCount: number;
  loadedCount: number;
  status: RuntimeSceneObjectComponentsTaskState['status'] | 'idle';
  isLoading: boolean;
  isStale: boolean;
  errorMessage: string | null;
};

export type SceneMutationState = {
  operation: RuntimeSceneMutationOperation | null;
  loading: boolean;
  errorMessage: string | null;
  task: WorkspaceTaskSnapshot | null;
  pendingOperations: Partial<Record<RuntimeSceneMutationOperation, number>>;
  activeIntentByObject: Record<string, SceneObjectActiveIntentState>;
};

export const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
  task: null,
  pendingOperations: {},
  activeIntentByObject: {},
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
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>;
  headerLoadingByAddress: Record<string, boolean>;
  headerErrorByAddress: Record<string, string | null>;
  componentsTaskByAddress: Record<string, RuntimeSceneObjectComponentsTaskState>;
  componentsLoadingByAddress: Record<string, boolean>;
  componentsErrorByAddress: Record<string, string | null>;
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
  | { type: 'setHeaderTaskByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectHeaderTaskState>> }
  | { type: 'setHeaderLoadingByAddress'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setHeaderErrorByAddress'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setComponentsTaskByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectComponentsTaskState>> }
  | { type: 'setComponentsLoadingByAddress'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setComponentsErrorByAddress'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setSceneMutationState'; updater: SceneStateUpdater<SceneMutationState> }
  | { type: 'applySummaryPatch'; summary: RuntimeSceneNodeSummary }
  | { type: 'applySummaryBatch'; summaries: RuntimeSceneNodeSummary[] }
  | { type: 'applySceneChildrenTaskState'; taskState: RuntimeSceneObjectChildrenTaskState }
  | { type: 'applyHeaderTaskState'; taskState: RuntimeSceneObjectHeaderTaskState }
  | { type: 'applyComponentsTaskState'; taskState: RuntimeSceneObjectComponentsTaskState }
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
  headerTaskByAddress: {},
  headerLoadingByAddress: {},
  headerErrorByAddress: {},
  componentsTaskByAddress: {},
  componentsLoadingByAddress: {},
  componentsErrorByAddress: {},
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

function buildSceneInspectorComponentsPanelState(
  selectedObjectAddress: string | null,
  inspectorsByAddress: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  componentsTaskByAddress: Record<string, RuntimeSceneObjectComponentsTaskState>,
  componentsLoadingByAddress: Record<string, boolean>,
  componentsErrorByAddress: Record<string, string | null>,
): SceneInspectorComponentsPanelState | null {
  if (!selectedObjectAddress) {
    return null;
  }

  const taskState = componentsTaskByAddress[selectedObjectAddress] ?? null;
  const inspector = inspectorsByAddress[selectedObjectAddress] ?? null;
  const components = taskState?.components ?? inspector?.components ?? [];

  return {
    objectAddress: selectedObjectAddress,
    components,
    totalCount: taskState?.totalCount ?? components.length,
    loadedCount: taskState?.loadedCount ?? components.length,
    status: taskState?.status ?? 'idle',
    isLoading: componentsLoadingByAddress[selectedObjectAddress] ?? false,
    isStale: taskState?.isStale ?? false,
    errorMessage: componentsErrorByAddress[selectedObjectAddress]
      ?? taskState?.errorMessage
      ?? null,
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
    case 'setHeaderTaskByAddress':
      return replaceSceneStoreValue(
        state,
        'headerTaskByAddress',
        resolveSceneStateUpdater(state.headerTaskByAddress, action.updater),
      );
    case 'setHeaderLoadingByAddress':
      return replaceSceneStoreValue(
        state,
        'headerLoadingByAddress',
        resolveSceneStateUpdater(state.headerLoadingByAddress, action.updater),
      );
    case 'setHeaderErrorByAddress':
      return replaceSceneStoreValue(
        state,
        'headerErrorByAddress',
        resolveSceneStateUpdater(state.headerErrorByAddress, action.updater),
      );
    case 'setComponentsTaskByAddress':
      return replaceSceneStoreValue(
        state,
        'componentsTaskByAddress',
        resolveSceneStateUpdater(state.componentsTaskByAddress, action.updater),
      );
    case 'setComponentsLoadingByAddress':
      return replaceSceneStoreValue(
        state,
        'componentsLoadingByAddress',
        resolveSceneStateUpdater(state.componentsLoadingByAddress, action.updater),
      );
    case 'setComponentsErrorByAddress':
      return replaceSceneStoreValue(
        state,
        'componentsErrorByAddress',
        resolveSceneStateUpdater(state.componentsErrorByAddress, action.updater),
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
      const cachedInspector = patched.inspectorsByAddress[taskState.parentObjectAddress];
      const nextInspectorsByAddress = cachedInspector == null || sameNodeOrder(cachedInspector.children, taskState.children)
        ? patched.inspectorsByAddress
        : {
            ...patched.inspectorsByAddress,
            [taskState.parentObjectAddress]: {
              ...cachedInspector,
              children: taskState.children,
            },
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
        inspectorsByAddress: nextInspectorsByAddress,
      };
    }
    case 'applyHeaderTaskState': {
      const { taskState } = action;
      const componentsTask = state.componentsTaskByAddress[taskState.objectAddress] ?? null;
      const nextSnapshotBase = buildInspectorSnapshot(
        taskState,
        state.childrenByParent[taskState.objectAddress]
          ?? state.inspectorsByAddress[taskState.objectAddress]?.children
          ?? [],
        componentsTask?.components
          ?? state.inspectorsByAddress[taskState.objectAddress]?.components
          ?? [],
      );
      const nextSnapshot = nextSnapshotBase
        ? syncInspectorComponentCount(nextSnapshotBase, componentsTask?.totalCount)
        : null;
      if (!nextSnapshot) {
        return {
          ...state,
          headerTaskByAddress: {
            ...state.headerTaskByAddress,
            [taskState.objectAddress]: taskState,
          },
          headerLoadingByAddress: {
            ...state.headerLoadingByAddress,
            [taskState.objectAddress]: !isTerminalHeaderTaskStatus(taskState.status),
          },
          headerErrorByAddress: {
            ...state.headerErrorByAddress,
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

      return {
        ...state,
        sceneWorkspace: nextSceneWorkspace,
        childrenByParent: nextChildrenByParent,
        inspectorsByAddress: nextInspectorsByAddress,
        headerTaskByAddress: {
          ...state.headerTaskByAddress,
          [taskState.objectAddress]: taskState,
        },
        headerLoadingByAddress: {
          ...state.headerLoadingByAddress,
          [taskState.objectAddress]: !isTerminalHeaderTaskStatus(taskState.status),
        },
        headerErrorByAddress: {
          ...state.headerErrorByAddress,
          [taskState.objectAddress]: taskState.errorMessage,
        },
      };
    }
    case 'applyComponentsTaskState': {
      const { taskState } = action;
      const currentInspector = state.inspectorsByAddress[taskState.objectAddress] ?? null;
      const nextSnapshotBase = currentInspector
        ? (sameComponentOrder(currentInspector.components, taskState.components)
          ? currentInspector
          : {
              ...currentInspector,
              components: taskState.components,
            })
        : buildInspectorSnapshot(
            state.headerTaskByAddress[taskState.objectAddress],
            state.childrenByParent[taskState.objectAddress] ?? [],
            taskState.components,
          );
      const nextSnapshot = nextSnapshotBase
        ? syncInspectorComponentCount(nextSnapshotBase, taskState.totalCount)
        : null;

      return {
        ...state,
        inspectorsByAddress: nextSnapshot
          ? mergeInspectorCaches(state.inspectorsByAddress, nextSnapshot)
          : state.inspectorsByAddress,
        componentsTaskByAddress: {
          ...state.componentsTaskByAddress,
          [taskState.objectAddress]: taskState,
        },
        componentsLoadingByAddress: {
          ...state.componentsLoadingByAddress,
          [taskState.objectAddress]: !isTerminalComponentsTaskStatus(taskState.status),
        },
        componentsErrorByAddress: {
          ...state.componentsErrorByAddress,
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
    headerTaskByAddress,
    headerLoadingByAddress,
    headerErrorByAddress,
    componentsTaskByAddress,
    componentsLoadingByAddress,
    componentsErrorByAddress,
    sceneMutationState,
    sceneTabs,
    activeSceneTabIndex,
  } = state;

  const processKeyRef = useRef<string | null>(null);
  const childTaskByParentRef = useRef(childTaskByParent);
  const headerTaskByAddressRef = useRef(headerTaskByAddress);
  const componentsTaskByAddressRef = useRef(componentsTaskByAddress);
  const sceneMutationTaskCounterRef = useRef(0);

  useEffect(() => {
    childTaskByParentRef.current = childTaskByParent;
  }, [childTaskByParent]);

  useEffect(() => {
    headerTaskByAddressRef.current = headerTaskByAddress;
  }, [headerTaskByAddress]);

  useEffect(() => {
    componentsTaskByAddressRef.current = componentsTaskByAddress;
  }, [componentsTaskByAddress]);

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

  const setHeaderTaskByAddress = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectHeaderTaskState>>) => {
    dispatch({ type: 'setHeaderTaskByAddress', updater });
  }, []);

  const setHeaderLoadingByAddress = useCallback((updater: SceneStateUpdater<Record<string, boolean>>) => {
    dispatch({ type: 'setHeaderLoadingByAddress', updater });
  }, []);

  const setHeaderErrorByAddress = useCallback((updater: SceneStateUpdater<Record<string, string | null>>) => {
    dispatch({ type: 'setHeaderErrorByAddress', updater });
  }, []);

  const setComponentsTaskByAddress = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectComponentsTaskState>>) => {
    dispatch({ type: 'setComponentsTaskByAddress', updater });
  }, []);

  const setComponentsLoadingByAddress = useCallback((updater: SceneStateUpdater<Record<string, boolean>>) => {
    dispatch({ type: 'setComponentsLoadingByAddress', updater });
  }, []);

  const setComponentsErrorByAddress = useCallback((updater: SceneStateUpdater<Record<string, string | null>>) => {
    dispatch({ type: 'setComponentsErrorByAddress', updater });
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

  const applyHeaderTaskState = useCallback((taskState: RuntimeSceneObjectHeaderTaskState) => {
    startTransition(() => {
      dispatch({ type: 'applyHeaderTaskState', taskState });
    });
  }, []);

  const applyComponentsTaskState = useCallback((taskState: RuntimeSceneObjectComponentsTaskState) => {
    startTransition(() => {
      dispatch({ type: 'applyComponentsTaskState', taskState });
    });
  }, []);

  const bumpParentChildCount = useCallback((objectAddress: string, delta: number) => {
    dispatch({ type: 'bumpParentChildCount', objectAddress, delta });
  }, []);

  const sceneInspector = useMemo(() => {
    if (!selectedObjectAddress) {
      return null;
    }

    const cachedInspector = inspectorsByAddress[selectedObjectAddress] ?? null;
    if (cachedInspector) {
      return syncInspectorComponentCount(cachedInspector, componentsTaskByAddress[selectedObjectAddress]?.totalCount);
    }

    const nextSnapshot = buildInspectorSnapshot(
      headerTaskByAddress[selectedObjectAddress],
      childrenByParent[selectedObjectAddress] ?? [],
      componentsTaskByAddress[selectedObjectAddress]?.components ?? [],
    );

    return nextSnapshot
      ? syncInspectorComponentCount(nextSnapshot, componentsTaskByAddress[selectedObjectAddress]?.totalCount)
      : null;
  }, [childrenByParent, componentsTaskByAddress, headerTaskByAddress, inspectorsByAddress, selectedObjectAddress]);

  const sceneInspectorHeaderTaskState = useMemo(() => {
    return selectedObjectAddress ? headerTaskByAddress[selectedObjectAddress] ?? null : null;
  }, [headerTaskByAddress, selectedObjectAddress]);

  const sceneInspectorComponentsTaskState = useMemo(() => {
    return selectedObjectAddress ? componentsTaskByAddress[selectedObjectAddress] ?? null : null;
  }, [componentsTaskByAddress, selectedObjectAddress]);
  const sceneInspectorComponentsPanel = useMemo(() => {
    return buildSceneInspectorComponentsPanelState(
      selectedObjectAddress,
      inspectorsByAddress,
      componentsTaskByAddress,
      componentsLoadingByAddress,
      componentsErrorByAddress,
    );
  }, [componentsErrorByAddress, componentsLoadingByAddress, componentsTaskByAddress, inspectorsByAddress, selectedObjectAddress]);

  const sceneInspectorLoading = selectedObjectAddress
    ? (headerLoadingByAddress[selectedObjectAddress] ?? false) && sceneInspector == null
    : false;
  const sceneInspectorError = selectedObjectAddress
    ? headerErrorByAddress[selectedObjectAddress]
      ?? childErrorByParent[selectedObjectAddress]
      ?? null
    : null;
  const sceneInspectorComponentsError = selectedObjectAddress
    ? componentsErrorByAddress[selectedObjectAddress]
      ?? componentsTaskByAddress[selectedObjectAddress]?.errorMessage
      ?? null
    : null;
  const sceneInspectorChildrenLoading = selectedObjectAddress ? loadingChildrenByParent[selectedObjectAddress] ?? false : false;
  const sceneInspectorComponentsLoading = selectedObjectAddress ? componentsLoadingByAddress[selectedObjectAddress] ?? false : false;

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
    headerTaskByAddress,
    setHeaderTaskByAddress,
    headerLoadingByAddress,
    setHeaderLoadingByAddress,
    headerErrorByAddress,
    setHeaderErrorByAddress,
    componentsTaskByAddress,
    setComponentsTaskByAddress,
    componentsLoadingByAddress,
    setComponentsLoadingByAddress,
    componentsErrorByAddress,
    setComponentsErrorByAddress,
    sceneMutationState,
    setSceneMutationState,
    sceneTabs,
    setSceneTabs,
    activeSceneTabIndex,
    setActiveSceneTabIndex,
    processKeyRef,
    childTaskByParentRef,
    headerTaskByAddressRef,
    componentsTaskByAddressRef,
    sceneMutationTaskCounterRef,
    resetSceneState,
    applySummaryPatch,
    applySummaryBatch,
    applySceneChildrenTaskState,
    applyHeaderTaskState,
    applyComponentsTaskState,
    bumpParentChildCount,
    sceneInspector,
    sceneInspectorHeaderTaskState,
    sceneInspectorComponentsTaskState,
    sceneInspectorComponentsPanel,
    sceneInspectorLoading,
    sceneInspectorError,
    sceneInspectorComponentsError,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneRootsByHandle,
    patchInspectorTransform,
  };
}