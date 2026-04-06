import React, { useMemo, useCallback } from 'react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneMutationOperation,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMouseTargetHit,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';
import { collectSceneWorkspaceTasks } from './sceneWorkspaceTasks';
import type { LoadedSceneGraph, LoadedSceneSearchProjection } from './loadedSceneNodes';
import type { SceneMutationState } from './useSceneWorkspaceStore';
import { useSceneWorkspaceStore } from './useSceneWorkspaceStore';
import { useSceneMutationActions } from './useSceneMutationActions';
import { useSceneMousePickerState } from './useSceneMousePickerState';
import { useSceneWorkspaceSync } from './useSceneWorkspaceSync';
import type { SceneInspectorComponentsPanelState, SceneInspectorTab } from './useSceneWorkspaceStore';

export interface SceneWorkspaceStateResult {
  sceneWorkspace: SceneWorkspaceState;
  refreshSceneWorkspace: () => Promise<void>;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
  sceneTabs: SceneInspectorTab[];
  activeSceneTabIndex: number;
  openTabForSceneObject: (tab: SceneInspectorTab) => void;
  handleCloseTab: (index: number, event: React.MouseEvent) => void;
  setActiveSceneTabIndex: (index: number) => void;
  loadedSceneGraph: LoadedSceneGraph;
  sceneHierarchySearchQuery: string;
  setSceneHierarchySearchQuery: (value: string) => void;
  sceneHierarchySearch: LoadedSceneSearchProjection | null;
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
  ensureSceneObjectChildrenLoaded: (objectAddress: string, force?: boolean) => Promise<void>;
  stopSceneObjectChildrenObservation: (objectAddress: string) => void;
  sceneInspector: RuntimeSceneObjectInspectorSnapshot | null;
  sceneInspectorHeaderTaskState: RuntimeSceneObjectHeaderTaskState | null;
  sceneInspectorComponentsTaskState: RuntimeSceneObjectComponentsTaskState | null;
  sceneInspectorComponentsPanel: SceneInspectorComponentsPanelState | null;
  sceneInspectorLoading: boolean;
  sceneInspectorChildrenLoading: boolean;
  sceneInspectorComponentsLoading: boolean;
  sceneInspectorError: string | null;
  sceneInspectorComponentsError: string | null;
  createSceneRoot: (sceneHandle: number, name: string) => Promise<RuntimeSceneMutationResult | null>;
  createSceneChild: (name: string) => Promise<RuntimeSceneMutationResult | null>;
  duplicateSceneObject: () => Promise<RuntimeSceneMutationResult | null>;
  deleteSceneObject: () => Promise<RuntimeSceneMutationResult | null>;
  renameSceneObject: (name: string) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectTag: (tag: string) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectLayer: (layer: number) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectHideFlags: (hideFlags: string) => Promise<RuntimeSceneMutationResult | null>;
  reparentSceneObject: (parentObjectAddress?: string | null, parentPath?: string | null) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectActive: (activeSelf: boolean) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectTransform: (transformUpdate: RuntimeSceneTransformUpdate) => Promise<RuntimeSceneMutationResult | null>;
  setSceneBehaviourEnabled: (componentAddress: string, enabled: boolean) => Promise<RuntimeSceneMutationResult | null>;
  createSceneComponent: (componentTypeName: string) => Promise<RuntimeSceneMutationResult | null>;
  deleteSceneComponent: (componentAddress: string) => Promise<RuntimeSceneMutationResult | null>;
  loadSceneByBuildIndex: (buildIndex: number) => Promise<RuntimeSceneMutationResult | null>;
  sceneMutationState: SceneMutationState;
  isSceneMutationPending: (operation: RuntimeSceneMutationOperation) => boolean;
  activeSceneTask: WorkspaceTaskSnapshot | null;
  sceneTasks: WorkspaceTaskSnapshot[];
  sceneRootsByHandle: Record<number, RuntimeSceneNodeSummary[]>;
  sceneObjectComponentsCapability: WorkspaceLifecycleState['runtimeSession']['sceneObjectComponents'];
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

export function useSceneWorkspaceState({
  repository,
  workspaceLifecycle,
  active,
}: {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
}): SceneWorkspaceStateResult {
  const store = useSceneWorkspaceStore();
  const {
    sceneWorkspace,
    setSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    loadedSceneGraph,
    sceneHierarchySearchQuery,
    setSceneHierarchySearchQuery,
    sceneHierarchySearch,
    childrenByParent,
    childTaskByParent,
    setChildTaskByParent,
    loadingChildrenByParent,
    setLoadingChildrenByParent,
    childErrorByParent,
    setChildErrorByParent,
    headerTaskByAddress,
    setHeaderTaskByAddress,
    setHeaderLoadingByAddress,
    setHeaderErrorByAddress,
    componentsTaskByAddress,
    setComponentsTaskByAddress,
    setComponentsLoadingByAddress,
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
    sceneTabs,
    setSceneTabs,
    activeSceneTabIndex,
    setActiveSceneTabIndex,
  } = store;
  const {
    loadSceneObjectHeader,
    loadSceneObjectResources,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
    refreshSceneWorkspace,
  } = useSceneWorkspaceSync({
    repository,
    workspaceLifecycle,
    active,
    sceneWorkspace,
    selectedObjectAddress,
    setSceneWorkspace,
    setLoadingChildrenByParent,
    setChildErrorByParent,
    setHeaderLoadingByAddress,
    setHeaderErrorByAddress,
    setComponentsLoadingByAddress,
    setComponentsErrorByAddress,
    processKeyRef,
    childTaskByParentRef,
    headerTaskByAddressRef,
    componentsTaskByAddressRef,
    resetSceneState,
    applySceneChildrenTaskState,
    applyHeaderTaskState,
    applyComponentsTaskState,
  });

  const {
    createSceneRoot,
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    renameSceneObject,
    setSceneObjectTag,
    setSceneObjectLayer,
    setSceneObjectHideFlags,
    reparentSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    setSceneBehaviourEnabled,
    createSceneComponent,
    deleteSceneComponent,
    loadSceneByBuildIndex,
  } = useSceneMutationActions({
    repository,
    selectedObjectAddress,
    setSelectedObjectAddress,
    refreshSceneWorkspace,
    loadSceneObjectResources,
    setChildTaskByParent,
    setHeaderTaskByAddress,
    setHeaderErrorByAddress,
    setHeaderLoadingByAddress,
    setComponentsTaskByAddress,
    setComponentsErrorByAddress,
    setComponentsLoadingByAddress,
    setSceneMutationState,
    sceneMutationTaskCounterRef,
  });
  const selectedHeaderTaskState = selectedObjectAddress
    ? headerTaskByAddress[selectedObjectAddress] ?? null
    : null;
  const revealedSelectedHierarchyKeyRef = React.useRef<string | null>(null);

  const openTabForSceneObject = useCallback((entry: SceneInspectorTab) => {
    setSceneTabs((previous) => {
      const existingIndex = previous.findIndex((tab) => tab.objectAddress === entry.objectAddress);
      const targetIndex = existingIndex >= 0 ? existingIndex : previous.length;
      
      setActiveSceneTabIndex(targetIndex);
      setSelectedObjectAddress(entry.objectAddress);
      
      if (existingIndex >= 0) {
        return previous;
      }
      return [...previous, entry];
    });
  }, [setActiveSceneTabIndex, setSceneTabs, setSelectedObjectAddress]);

  const revealSceneHierarchyPath = useCallback((hierarchyPath: RuntimeSceneMouseTargetHit['hierarchyPath']) => {
    const ancestorAddresses = Array.from(new Set(
      hierarchyPath
        .map((entry) => entry.objectAddress)
        .filter((objectAddress): objectAddress is string => objectAddress.length > 0),
    ));

    if (ancestorAddresses.length <= 1) {
      return Promise.resolve();
    }

    return Promise.all(
      ancestorAddresses
        .slice(0, -1)
        .flatMap((objectAddress) => [
          loadSceneObjectHeader(objectAddress),
          ensureSceneObjectChildrenLoaded(objectAddress),
        ]),
    ).then(() => undefined);
  }, [ensureSceneObjectChildrenLoaded, loadSceneObjectHeader]);

  const openSceneMousePickHit = useCallback((hit: RuntimeSceneMouseTargetHit) => {
    openTabForSceneObject({
      objectAddress: hit.objectAddress,
      name: hit.objectName,
      sceneName: hit.sceneName ?? undefined,
      sceneKind: hit.sceneKind ?? undefined,
    });
    revealSceneHierarchyPath(hit.hierarchyPath).catch(() => undefined);
  }, [openTabForSceneObject, revealSceneHierarchyPath]);

  React.useEffect(() => {
    revealedSelectedHierarchyKeyRef.current = null;
  }, [selectedObjectAddress]);

  React.useEffect(() => {
    if (!active || !selectedObjectAddress) {
      return;
    }

    loadSceneObjectHeader(selectedObjectAddress).catch(() => undefined);
  }, [active, loadSceneObjectHeader, selectedObjectAddress]);

  React.useEffect(() => {
    if (!active || !selectedObjectAddress) {
      return;
    }

    const header = selectedHeaderTaskState?.header;
    if (!header) {
      return;
    }

    const revealKey = `${selectedObjectAddress}:${selectedHeaderTaskState.resourceRevision}:${header.hierarchyPath.map((entry) => entry.objectAddress).join('>')}`;
    if (revealedSelectedHierarchyKeyRef.current === revealKey) {
      return;
    }

    revealedSelectedHierarchyKeyRef.current = revealKey;
    revealSceneHierarchyPath(header.hierarchyPath).catch(() => undefined);
  }, [active, revealSceneHierarchyPath, selectedHeaderTaskState, selectedObjectAddress]);

  const handleCloseTab = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setSceneTabs((previous) => {
      const next = [...previous];
      next.splice(index, 1);
      if (next.length === 0) {
        setActiveSceneTabIndex(-1);
        setSelectedObjectAddress(null);
      } else {
        setActiveSceneTabIndex((current) => {
          if (current >= index) {
            const nextActive = Math.max(0, current - 1);
            setSelectedObjectAddress(next[nextActive].objectAddress);
            return nextActive;
          }
          setSelectedObjectAddress(next[current].objectAddress);
          return current;
        });
      }
      return next;
    });
  }, [setActiveSceneTabIndex, setSceneTabs, setSelectedObjectAddress]);

  const handleSetActiveSceneTabIndex = useCallback((index: number) => {
    setActiveSceneTabIndex(index);
    if (sceneTabs[index]) {
      setSelectedObjectAddress(sceneTabs[index].objectAddress);
    }
  }, [sceneTabs, setActiveSceneTabIndex, setSelectedObjectAddress]);

  const handleSetSelectedObjectAddress = useCallback((value: string | null) => {
    setSelectedObjectAddress(value);
  }, [setSelectedObjectAddress]);

  const {
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
  } = useSceneMousePickerState({
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
  });

  const sceneTasks = useMemo(() => {
    return collectSceneWorkspaceTasks({
      sceneWorkspace,
      childTaskByParent,
      headerTaskByAddress,
      componentsTaskByAddress,
      mutationTask: sceneMutationState.task,
    });
  }, [childTaskByParent, componentsTaskByAddress, headerTaskByAddress, sceneMutationState.task, sceneWorkspace]);

  const isSceneMutationPending = useCallback((operation: RuntimeSceneMutationOperation) => {
    return (sceneMutationState.pendingOperations[operation] ?? 0) > 0;
  }, [sceneMutationState.pendingOperations]);

  const sceneObjectComponentsCapability = workspaceLifecycle.runtimeSession.sceneObjectComponents;

  return {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress: handleSetSelectedObjectAddress,
    sceneTabs,
    activeSceneTabIndex,
    openTabForSceneObject,
    handleCloseTab,
    setActiveSceneTabIndex: handleSetActiveSceneTabIndex,
    loadedSceneGraph,
    sceneHierarchySearchQuery,
    setSceneHierarchySearchQuery,
    sceneHierarchySearch,
    childrenByParent,
    childTaskByParent,
    loadingChildrenByParent,
    childErrorByParent,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
    sceneInspector,
    sceneInspectorHeaderTaskState,
    sceneInspectorComponentsTaskState,
    sceneInspectorComponentsPanel,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    sceneInspectorComponentsError,
    createSceneRoot,
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    renameSceneObject,
    setSceneObjectTag,
    setSceneObjectLayer,
    setSceneObjectHideFlags,
    reparentSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    setSceneBehaviourEnabled,
    createSceneComponent,
    deleteSceneComponent,
    loadSceneByBuildIndex,
    sceneMutationState,
    isSceneMutationPending,
    activeSceneTask: sceneMutationState.task,
    sceneTasks,
    sceneRootsByHandle,
    sceneObjectComponentsCapability,
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