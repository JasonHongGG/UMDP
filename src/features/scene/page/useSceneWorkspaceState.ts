import { useMemo } from 'react';
import type {
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
import { useSceneWorkspaceSync } from './useSceneWorkspaceSync';

export interface SceneWorkspaceStateResult {
  sceneWorkspace: SceneWorkspaceState;
  refreshSceneWorkspace: () => Promise<void>;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
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
  activeSceneTask: WorkspaceTaskSnapshot | null;
  sceneTasks: WorkspaceTaskSnapshot[];
  sceneRootsByHandle: Record<number, RuntimeSceneNodeSummary[]>;
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

  const sceneTasks = useMemo(() => {
    return collectSceneWorkspaceTasks({
      sceneWorkspace,
      childTaskByParent,
      inspectorTaskByAddress,
      mutationTask: sceneMutationState.task,
    });
  }, [childTaskByParent, inspectorTaskByAddress, sceneMutationState.task, sceneWorkspace]);

  return {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
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
    activeSceneTask: sceneMutationState.task,
    sceneTasks,
    sceneRootsByHandle,
  };
}