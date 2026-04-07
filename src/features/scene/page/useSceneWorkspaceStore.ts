import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneComponentSummary,
  RuntimeSceneMutationOperation,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  EMPTY_SCENE_WORKSPACE_STATE,
  hasFreshSceneResourceSnapshot,
  isTerminalComponentsTaskStatus,
  isTerminalChildrenTaskStatus,
  isTerminalHeaderTaskStatus,
} from './sceneWorkspaceStatePatches';
import {
  buildLoadedSceneGraph,
  createLoadedSceneSearchProjection,
  type LoadedSceneGraph,
  type LoadedSceneSearchProjection,
} from './loadedSceneNodes';
import {
  buildSceneChildrenByParent,
  buildSceneEntityMap,
  buildSceneInspectors,
  type SceneEntityMap,
} from './sceneWorkspaceModel';
import {
  persistSceneWorkspaceActiveTabIndex,
  persistSceneWorkspaceSelectedObject,
  persistSceneWorkspaceTabs,
  readSceneWorkspacePersistence,
} from './sceneWorkspacePersistence';

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
  activeOverrideByObject: Record<string, boolean>;
};

export const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
  task: null,
  pendingOperations: {},
  activeIntentByObject: {},
  activeOverrideByObject: {},
};

export const EMPTY_SCENE_MOUSE_PICKER_STATE: RuntimeSceneMousePickerSnapshot = {
  resourceRevision: 0,
  sessionKey: null,
  status: 'idle',
  statusDetail: null,
  isRunning: false,
  targetWindow: null,
  cursorScreenPosition: null,
  cursorClientPosition: null,
  cursorInsideClient: false,
  hoverHit: null,
  recentHits: [],
  lastUpdatedAt: null,
  errorMessage: null,
};

type SceneWorkspaceStoreState = {
  sceneWorkspace: SceneWorkspaceState;
  selectedObjectAddress: string | null;
  sceneHierarchySearchQuery: string;
  sceneEntities: SceneEntityMap;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>;
  headerLoadingByAddress: Record<string, boolean>;
  headerErrorByAddress: Record<string, string | null>;
  componentsTaskByAddress: Record<string, RuntimeSceneObjectComponentsTaskState>;
  componentsLoadingByAddress: Record<string, boolean>;
  componentsErrorByAddress: Record<string, string | null>;
  sceneMutationState: SceneMutationState;
  scenePickerWindows: ProcessWindowCandidate[];
  scenePickerWindowsLoading: boolean;
  scenePickerWindowsError: string | null;
  sceneMousePickerState: RuntimeSceneMousePickerSnapshot;
  sceneTabs: SceneInspectorTab[];
  activeSceneTabIndex: number;
};

type SceneStateUpdater<T> = T | ((previous: T) => T);

type SceneWorkspaceStoreAction =
  | { type: 'reset' }
  | { type: 'setSceneWorkspace'; updater: SceneStateUpdater<SceneWorkspaceState> }
  | { type: 'setSelectedObjectAddress'; updater: SceneStateUpdater<string | null> }
  | { type: 'setSceneHierarchySearchQuery'; updater: SceneStateUpdater<string> }
  | { type: 'setChildTaskByParent'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectChildrenTaskState>> }
  | { type: 'setLoadingChildrenByParent'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setChildErrorByParent'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setHeaderTaskByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectHeaderTaskState>> }
  | { type: 'setHeaderLoadingByAddress'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setHeaderErrorByAddress'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setComponentsTaskByAddress'; updater: SceneStateUpdater<Record<string, RuntimeSceneObjectComponentsTaskState>> }
  | { type: 'setComponentsLoadingByAddress'; updater: SceneStateUpdater<Record<string, boolean>> }
  | { type: 'setComponentsErrorByAddress'; updater: SceneStateUpdater<Record<string, string | null>> }
  | { type: 'setSceneMutationState'; updater: SceneStateUpdater<SceneMutationState> }
  | { type: 'setScenePickerWindows'; updater: SceneStateUpdater<ProcessWindowCandidate[]> }
  | { type: 'setScenePickerWindowsLoading'; updater: SceneStateUpdater<boolean> }
  | { type: 'setScenePickerWindowsError'; updater: SceneStateUpdater<string | null> }
  | { type: 'setSceneMousePickerState'; updater: SceneStateUpdater<RuntimeSceneMousePickerSnapshot> }
  | { type: 'applySceneChildrenTaskState'; taskState: RuntimeSceneObjectChildrenTaskState }
  | { type: 'applyHeaderTaskState'; taskState: RuntimeSceneObjectHeaderTaskState }
  | { type: 'applyComponentsTaskState'; taskState: RuntimeSceneObjectComponentsTaskState }
  | { type: 'setSceneTabs'; updater: SceneStateUpdater<SceneInspectorTab[]> }
  | { type: 'setActiveSceneTabIndex'; updater: SceneStateUpdater<number> };

const EMPTY_SCENE_WORKSPACE_STORE_STATE: SceneWorkspaceStoreState = {
  sceneWorkspace: EMPTY_SCENE_WORKSPACE_STATE,
  selectedObjectAddress: null,
  sceneHierarchySearchQuery: '',
  sceneEntities: {},
  childTaskByParent: {},
  loadingChildrenByParent: {},
  childErrorByParent: {},
  headerTaskByAddress: {},
  headerLoadingByAddress: {},
  headerErrorByAddress: {},
  componentsTaskByAddress: {},
  componentsLoadingByAddress: {},
  componentsErrorByAddress: {},
  sceneMutationState: EMPTY_MUTATION_STATE,
  scenePickerWindows: [],
  scenePickerWindowsLoading: false,
  scenePickerWindowsError: null,
  sceneMousePickerState: EMPTY_SCENE_MOUSE_PICKER_STATE,
  sceneTabs: [],
  activeSceneTabIndex: -1,
};

function initSceneWorkspaceStoreState(): SceneWorkspaceStoreState {
  const persistedState = readSceneWorkspacePersistence();

  return {
    ...EMPTY_SCENE_WORKSPACE_STORE_STATE,
    sceneTabs: persistedState.sceneTabs,
    activeSceneTabIndex: persistedState.activeSceneTabIndex,
    selectedObjectAddress: persistedState.selectedObjectAddress,
  };
}

function resolveSceneStateUpdater<T>(previous: T, updater: SceneStateUpdater<T>) {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(previous);
  }

  return updater;
}

function rebuildSceneEntities(state: Pick<SceneWorkspaceStoreState, 'sceneWorkspace' | 'childTaskByParent' | 'headerTaskByAddress'>) {
  return buildSceneEntityMap({
    sceneWorkspace: state.sceneWorkspace,
    childTaskByParent: state.childTaskByParent,
    headerTaskByAddress: state.headerTaskByAddress,
  });
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
  const components = hasFreshSceneResourceSnapshot(taskState?.resourceState)
    ? (taskState?.components ?? inspector?.components ?? [])
    : (inspector?.components ?? taskState?.components ?? []);

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
    case 'reset': {
      const nextState: SceneWorkspaceStoreState = {
        ...EMPTY_SCENE_WORKSPACE_STORE_STATE,
        selectedObjectAddress: state.selectedObjectAddress,
        sceneTabs: state.sceneTabs,
        activeSceneTabIndex: state.activeSceneTabIndex,
      };
      return nextState;
    }
    case 'setSceneWorkspace': {
      const sceneWorkspace = resolveSceneStateUpdater(state.sceneWorkspace, action.updater);
      return {
        ...state,
        sceneWorkspace,
        sceneEntities: rebuildSceneEntities({
          sceneWorkspace,
          childTaskByParent: state.childTaskByParent,
          headerTaskByAddress: state.headerTaskByAddress,
        }),
      };
    }
    case 'setSelectedObjectAddress': {
      const nextAddress = resolveSceneStateUpdater(state.selectedObjectAddress, action.updater);
      return {
        ...state,
        selectedObjectAddress: nextAddress,
      };
    }
    case 'setSceneHierarchySearchQuery':
      return {
        ...state,
        sceneHierarchySearchQuery: resolveSceneStateUpdater(state.sceneHierarchySearchQuery, action.updater),
      };
    case 'setChildTaskByParent': {
      const childTaskByParent = resolveSceneStateUpdater(state.childTaskByParent, action.updater);
      return {
        ...state,
        childTaskByParent,
        sceneEntities: rebuildSceneEntities({
          sceneWorkspace: state.sceneWorkspace,
          childTaskByParent,
          headerTaskByAddress: state.headerTaskByAddress,
        }),
      };
    }
    case 'setLoadingChildrenByParent':
      return {
        ...state,
        loadingChildrenByParent: resolveSceneStateUpdater(state.loadingChildrenByParent, action.updater),
      };
    case 'setChildErrorByParent':
      return {
        ...state,
        childErrorByParent: resolveSceneStateUpdater(state.childErrorByParent, action.updater),
      };
    case 'setHeaderTaskByAddress': {
      const headerTaskByAddress = resolveSceneStateUpdater(state.headerTaskByAddress, action.updater);
      return {
        ...state,
        headerTaskByAddress,
        sceneEntities: rebuildSceneEntities({
          sceneWorkspace: state.sceneWorkspace,
          childTaskByParent: state.childTaskByParent,
          headerTaskByAddress,
        }),
      };
    }
    case 'setHeaderLoadingByAddress':
      return {
        ...state,
        headerLoadingByAddress: resolveSceneStateUpdater(state.headerLoadingByAddress, action.updater),
      };
    case 'setHeaderErrorByAddress':
      return {
        ...state,
        headerErrorByAddress: resolveSceneStateUpdater(state.headerErrorByAddress, action.updater),
      };
    case 'setComponentsTaskByAddress':
      return {
        ...state,
        componentsTaskByAddress: resolveSceneStateUpdater(state.componentsTaskByAddress, action.updater),
      };
    case 'setComponentsLoadingByAddress':
      return {
        ...state,
        componentsLoadingByAddress: resolveSceneStateUpdater(state.componentsLoadingByAddress, action.updater),
      };
    case 'setComponentsErrorByAddress':
      return {
        ...state,
        componentsErrorByAddress: resolveSceneStateUpdater(state.componentsErrorByAddress, action.updater),
      };
    case 'setSceneMutationState':
      return {
        ...state,
        sceneMutationState: resolveSceneStateUpdater(state.sceneMutationState, action.updater),
      };
    case 'setScenePickerWindows':
      return {
        ...state,
        scenePickerWindows: resolveSceneStateUpdater(state.scenePickerWindows, action.updater),
      };
    case 'setScenePickerWindowsLoading':
      return {
        ...state,
        scenePickerWindowsLoading: resolveSceneStateUpdater(state.scenePickerWindowsLoading, action.updater),
      };
    case 'setScenePickerWindowsError':
      return {
        ...state,
        scenePickerWindowsError: resolveSceneStateUpdater(state.scenePickerWindowsError, action.updater),
      };
    case 'setSceneMousePickerState':
      return {
        ...state,
        sceneMousePickerState: resolveSceneStateUpdater(state.sceneMousePickerState, action.updater),
      };
    case 'setSceneTabs': {
      const nextTabs = resolveSceneStateUpdater(state.sceneTabs, action.updater);
      return {
        ...state,
        sceneTabs: nextTabs,
      };
    }
    case 'setActiveSceneTabIndex': {
      const nextIndex = resolveSceneStateUpdater(state.activeSceneTabIndex, action.updater);
      return {
        ...state,
        activeSceneTabIndex: nextIndex,
      };
    }
    case 'applySceneChildrenTaskState': {
      const childTaskByParent = {
        ...state.childTaskByParent,
        [action.taskState.parentObjectAddress]: action.taskState,
      };
      return {
        ...state,
        childTaskByParent,
        loadingChildrenByParent: {
          ...state.loadingChildrenByParent,
          [action.taskState.parentObjectAddress]: !isTerminalChildrenTaskStatus(action.taskState.status),
        },
        childErrorByParent: {
          ...state.childErrorByParent,
          [action.taskState.parentObjectAddress]: action.taskState.errorMessage,
        },
        sceneEntities: rebuildSceneEntities({
          sceneWorkspace: state.sceneWorkspace,
          childTaskByParent,
          headerTaskByAddress: state.headerTaskByAddress,
        }),
      };
    }
    case 'applyHeaderTaskState': {
      const headerTaskByAddress = {
        ...state.headerTaskByAddress,
        [action.taskState.objectAddress]: action.taskState,
      };
      const activeOverride = state.sceneMutationState.activeOverrideByObject[action.taskState.objectAddress];
      const shouldClearActiveOverride = activeOverride != null
        && action.taskState.status === 'ready'
        && action.taskState.resourceState.freshness === 'fresh'
        && action.taskState.header?.object.activeSelf === activeOverride;
      return {
        ...state,
        headerTaskByAddress,
        headerLoadingByAddress: {
          ...state.headerLoadingByAddress,
          [action.taskState.objectAddress]: !isTerminalHeaderTaskStatus(action.taskState.status),
        },
        headerErrorByAddress: {
          ...state.headerErrorByAddress,
          [action.taskState.objectAddress]: action.taskState.errorMessage,
        },
        sceneMutationState: shouldClearActiveOverride
          ? {
              ...state.sceneMutationState,
              activeOverrideByObject: Object.fromEntries(
                Object.entries(state.sceneMutationState.activeOverrideByObject)
                  .filter(([objectAddress]) => objectAddress !== action.taskState.objectAddress),
              ),
            }
          : state.sceneMutationState,
        sceneEntities: rebuildSceneEntities({
          sceneWorkspace: state.sceneWorkspace,
          childTaskByParent: state.childTaskByParent,
          headerTaskByAddress,
        }),
      };
    }
    case 'applyComponentsTaskState':
      return {
        ...state,
        componentsTaskByAddress: {
          ...state.componentsTaskByAddress,
          [action.taskState.objectAddress]: action.taskState,
        },
        componentsLoadingByAddress: {
          ...state.componentsLoadingByAddress,
          [action.taskState.objectAddress]: !isTerminalComponentsTaskStatus(action.taskState.status),
        },
        componentsErrorByAddress: {
          ...state.componentsErrorByAddress,
          [action.taskState.objectAddress]: action.taskState.errorMessage,
        },
      };
    default:
      return state;
  }
}

export function useSceneWorkspaceStore() {
  const [state, dispatch] = useReducer(
    sceneWorkspaceStoreReducer,
    EMPTY_SCENE_WORKSPACE_STORE_STATE,
    initSceneWorkspaceStoreState,
  );
  const {
    sceneWorkspace,
    selectedObjectAddress,
    sceneHierarchySearchQuery,
    sceneEntities,
    childTaskByParent,
    loadingChildrenByParent,
    childErrorByParent,
    headerTaskByAddress,
    headerLoadingByAddress,
    headerErrorByAddress,
    componentsTaskByAddress,
    componentsLoadingByAddress,
    componentsErrorByAddress,
    sceneMutationState,
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
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

  useEffect(() => {
    persistSceneWorkspaceSelectedObject(selectedObjectAddress);
  }, [selectedObjectAddress]);

  useEffect(() => {
    persistSceneWorkspaceTabs(sceneTabs);
  }, [sceneTabs]);

  useEffect(() => {
    persistSceneWorkspaceActiveTabIndex(activeSceneTabIndex);
  }, [activeSceneTabIndex]);

  const childrenByParent = useMemo(() => buildSceneChildrenByParent(sceneEntities), [sceneEntities]);
  const inspectorsByAddress = useMemo(() => buildSceneInspectors({
    childrenByParent,
    headerTaskByAddress,
    componentsTaskByAddress,
  }), [childrenByParent, componentsTaskByAddress, headerTaskByAddress]);

  const deferredSceneHierarchySearchQuery = useDeferredValue(sceneHierarchySearchQuery.trim().toLowerCase());
  const loadedSceneGraph = useMemo(
    () => buildLoadedSceneGraph(sceneWorkspace, childrenByParent, headerTaskByAddress),
    [childrenByParent, headerTaskByAddress, sceneWorkspace],
  );
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

  const setChildTaskByParent = useCallback((updater: SceneStateUpdater<Record<string, RuntimeSceneObjectChildrenTaskState>>) => {
    dispatch({ type: 'setChildTaskByParent', updater });
  }, []);

  const setLoadingChildrenByParent = useCallback((updater: SceneStateUpdater<Record<string, boolean>>) => {
    dispatch({ type: 'setLoadingChildrenByParent', updater });
  }, []);

  const setChildErrorByParent = useCallback((updater: SceneStateUpdater<Record<string, string | null>>) => {
    dispatch({ type: 'setChildErrorByParent', updater });
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

  const setScenePickerWindows = useCallback((updater: SceneStateUpdater<ProcessWindowCandidate[]>) => {
    dispatch({ type: 'setScenePickerWindows', updater });
  }, []);

  const setScenePickerWindowsLoading = useCallback((updater: SceneStateUpdater<boolean>) => {
    dispatch({ type: 'setScenePickerWindowsLoading', updater });
  }, []);

  const setScenePickerWindowsError = useCallback((updater: SceneStateUpdater<string | null>) => {
    dispatch({ type: 'setScenePickerWindowsError', updater });
  }, []);

  const setSceneMousePickerState = useCallback((updater: SceneStateUpdater<RuntimeSceneMousePickerSnapshot>) => {
    dispatch({ type: 'setSceneMousePickerState', updater });
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

  const sceneInspector = useMemo(() => {
    if (!selectedObjectAddress) {
      return null;
    }

    const inspector = inspectorsByAddress[selectedObjectAddress] ?? null;
    if (!inspector) {
      return null;
    }

    const activeIntent = sceneMutationState.activeIntentByObject[selectedObjectAddress];
    const activeOverride = sceneMutationState.activeOverrideByObject[selectedObjectAddress];
    const desiredActiveSelf = activeIntent?.desiredActiveSelf ?? activeOverride;
    if (desiredActiveSelf == null || inspector.object.activeSelf === desiredActiveSelf) {
      return inspector;
    }

    return {
      ...inspector,
      object: {
        ...inspector.object,
        activeSelf: desiredActiveSelf,
      },
    };
  }, [inspectorsByAddress, sceneMutationState.activeIntentByObject, sceneMutationState.activeOverrideByObject, selectedObjectAddress]);

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
    const rootsBySceneHandle = new Map<number, RuntimeSceneNodeSummary[]>();

    loadedSceneGraph.records.forEach((record) => {
      if (record.depth !== 0) {
        return;
      }

      const current = rootsBySceneHandle.get(record.sceneHandle) ?? [];
      if (current.some((node) => node.objectAddress === record.node.objectAddress)) {
        return;
      }

      rootsBySceneHandle.set(record.sceneHandle, [...current, record.node]);
    });

    return Object.fromEntries(rootsBySceneHandle.entries());
  }, [loadedSceneGraph]);

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
    childTaskByParent,
    setChildTaskByParent,
    loadingChildrenByParent,
    setLoadingChildrenByParent,
    childErrorByParent,
    setChildErrorByParent,
    inspectorsByAddress,
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
    scenePickerWindows,
    setScenePickerWindows,
    scenePickerWindowsLoading,
    setScenePickerWindowsLoading,
    scenePickerWindowsError,
    setScenePickerWindowsError,
    sceneMousePickerState,
    setSceneMousePickerState,
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
    applySceneChildrenTaskState,
    applyHeaderTaskState,
    applyComponentsTaskState,
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
  };
}
