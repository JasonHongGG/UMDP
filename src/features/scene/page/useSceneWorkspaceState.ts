import React, { useMemo, useCallback } from 'react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneMutationOperation,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMouseTargetHit,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState, WorkspaceTaskScope, WorkspaceTaskSnapshot } from '@/shared/contracts';
import { collectSceneWorkspaceTasks } from './sceneWorkspaceTasks';
import type { LoadedSceneGraph, LoadedSceneSearchProjection } from './loadedSceneNodes';
import { EMPTY_MUTATION_STATE, type SceneMutationState, useSceneWorkspaceStore } from './useSceneWorkspaceStore';
import { useSceneMutationActions } from './useSceneMutationActions';
import { useSceneMousePickerState } from './useSceneMousePickerState';
import { useSceneWorkspaceSync } from './useSceneWorkspaceSync';
import type { SceneInspectorTab } from './useSceneWorkspaceStore';

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
  sceneInspectorTaskState: RuntimeSceneObjectInspectorTaskState | null;
  sceneInspectorLoading: boolean;
  sceneInspectorChildrenLoading: boolean;
  sceneInspectorComponentsLoading: boolean;
  sceneInspectorError: string | null;
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
    childTaskByParentRef,
    inspectorTaskByAddressRef,
    childPollTokensRef,
    activeChildTaskIdByParentRef,
    activeInspectorTaskIdRef,
    inspectorPollTokenRef,
    sceneMutationTaskCounterRef,
    resetSceneState,
    applySummaryPatch,
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
    sceneTabs,
    setSceneTabs,
    activeSceneTabIndex,
    setActiveSceneTabIndex,
  } = store;
  const {
    loadSceneObjectInspector,
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
    setInspectorLoadingByAddress,
    setInspectorErrorByAddress,
    processKeyRef,
    childTaskByParentRef,
    inspectorTaskByAddressRef,
    resetSceneState,
    applySceneChildrenTaskState,
    applyInspectorTaskState,
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
    loadSceneObjectInspector,
    setSceneWorkspace,
    setChildrenByParent,
    setChildTaskByParent,
    setInspectorsByAddress,
    setInspectorTaskByAddress,
    setInspectorErrorByAddress,
    setInspectorLoadingByAddress,
    setSceneMutationState,
    sceneMutationTaskCounterRef,
    applySummaryPatch,
    bumpParentChildCount,
  });

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

  const openSceneMousePickHit = useCallback((hit: RuntimeSceneMouseTargetHit) => {
    openTabForSceneObject({
      objectAddress: hit.objectAddress,
      name: hit.objectName,
      sceneName: hit.sceneName ?? undefined,
      sceneKind: hit.sceneKind ?? undefined,
    });
  }, [openTabForSceneObject]);

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
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
  } = useSceneMousePickerState({
    repository,
    workspaceLifecycle,
    active,
    onPickHit: openSceneMousePickHit,
  });

  const sceneTasks = useMemo(() => {
    return collectSceneWorkspaceTasks({
      sceneWorkspace,
      childTaskByParent,
      inspectorTaskByAddress,
      mutationTask: sceneMutationState.task,
    });
  }, [childTaskByParent, inspectorTaskByAddress, sceneMutationState.task, sceneWorkspace]);

  const isSceneMutationPending = useCallback((operation: RuntimeSceneMutationOperation) => {
    return (sceneMutationState.pendingOperations[operation] ?? 0) > 0;
  }, [sceneMutationState.pendingOperations]);

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
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
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