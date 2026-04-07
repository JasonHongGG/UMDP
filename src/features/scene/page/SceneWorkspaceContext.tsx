import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSceneGateway } from '@/domain/scene/hooks/useSceneGateway';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { useSceneWorkspaceState, type SceneWorkspaceStateResult } from './useSceneWorkspaceState';

type SceneTreeContextValue = Pick<SceneWorkspaceStateResult,
  | 'sceneWorkspace'
  | 'refreshSceneWorkspace'
  | 'selectedObjectAddress'
  | 'setSelectedObjectAddress'
  | 'openTabForSceneObject'
  | 'loadedSceneGraph'
  | 'sceneHierarchySearchQuery'
  | 'setSceneHierarchySearchQuery'
  | 'sceneHierarchySearch'
  | 'childrenByParent'
  | 'childTaskByParent'
  | 'loadingChildrenByParent'
  | 'childErrorByParent'
  | 'ensureSceneObjectChildrenLoaded'
  | 'stopSceneObjectChildrenObservation'
>;

type SceneHierarchyGraphContextValue = Pick<SceneWorkspaceStateResult,
  | 'loadedSceneGraph'
  | 'childrenByParent'
>;

type SceneInspectorContextValue = Pick<SceneWorkspaceStateResult,
  | 'selectedObjectAddress'
  | 'setSelectedObjectAddress'
  | 'sceneTabs'
  | 'activeSceneTabIndex'
  | 'openTabForSceneObject'
  | 'handleCloseTab'
  | 'setActiveSceneTabIndex'
  | 'sceneInspector'
  | 'sceneInspectorHeaderTaskState'
  | 'sceneInspectorComponentsTaskState'
  | 'sceneInspectorComponentsPanel'
  | 'sceneInspectorLoading'
  | 'sceneInspectorChildrenLoading'
  | 'sceneInspectorComponentsLoading'
  | 'sceneInspectorError'
  | 'sceneInspectorComponentsError'
  | 'sceneObjectComponentsCapability'
>;

type SceneMutationContextValue = Pick<SceneWorkspaceStateResult,
  | 'createSceneRoot'
  | 'createSceneChild'
  | 'duplicateSceneObject'
  | 'deleteSceneObject'
  | 'renameSceneObject'
  | 'setSceneObjectTag'
  | 'setSceneObjectLayer'
  | 'setSceneObjectHideFlags'
  | 'reparentSceneObject'
  | 'setSceneObjectActive'
  | 'setSceneObjectTransform'
  | 'setSceneBehaviourEnabled'
  | 'createSceneComponent'
  | 'deleteSceneComponent'
  | 'loadSceneByBuildIndex'
  | 'sceneMutationState'
  | 'isSceneMutationPending'
  | 'activeSceneTask'
>;

type SceneMousePickerContextValue = Pick<SceneWorkspaceStateResult,
  | 'scenePickerWindows'
  | 'scenePickerWindowsLoading'
  | 'scenePickerWindowsError'
  | 'sceneMousePickerState'
  | 'refreshScenePickerWindows'
  | 'setSceneMousePickerTarget'
  | 'startSceneMousePicker'
  | 'stopSceneMousePicker'
  | 'openSceneMousePickHit'
>;

const SceneTreeContext = createContext<SceneTreeContextValue | null>(null);
const SceneHierarchyGraphContext = createContext<SceneHierarchyGraphContextValue | null>(null);
const SceneInspectorContext = createContext<SceneInspectorContextValue | null>(null);
const SceneMutationContext = createContext<SceneMutationContextValue | null>(null);
const SceneMousePickerContext = createContext<SceneMousePickerContextValue | null>(null);

function useRequiredSceneContext<T>(context: React.Context<T | null>, hookName: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${hookName} must be used within SceneWorkspaceProvider`);
  }

  return value;
}

export function SceneWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const repository = useSceneGateway();
  const { workspaceLifecycle, setWorkspaceTasks } = useWorkspaceShellState();
  const state = useSceneWorkspaceState({
    repository,
    workspaceLifecycle,
    active: true,
  });

  useEffect(() => {
    setWorkspaceTasks('scene', state.sceneTasks);
    return () => {
      setWorkspaceTasks('scene', []);
    };
  }, [setWorkspaceTasks, state.sceneTasks]);

  const treeState = useMemo<SceneTreeContextValue>(() => ({
    sceneWorkspace: state.sceneWorkspace,
    refreshSceneWorkspace: state.refreshSceneWorkspace,
    selectedObjectAddress: state.selectedObjectAddress,
    setSelectedObjectAddress: state.setSelectedObjectAddress,
    openTabForSceneObject: state.openTabForSceneObject,
    loadedSceneGraph: state.loadedSceneGraph,
    sceneHierarchySearchQuery: state.sceneHierarchySearchQuery,
    setSceneHierarchySearchQuery: state.setSceneHierarchySearchQuery,
    sceneHierarchySearch: state.sceneHierarchySearch,
    childrenByParent: state.childrenByParent,
    childTaskByParent: state.childTaskByParent,
    loadingChildrenByParent: state.loadingChildrenByParent,
    childErrorByParent: state.childErrorByParent,
    ensureSceneObjectChildrenLoaded: state.ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation: state.stopSceneObjectChildrenObservation,
  }), [
    state.sceneWorkspace,
    state.refreshSceneWorkspace,
    state.selectedObjectAddress,
    state.setSelectedObjectAddress,
    state.openTabForSceneObject,
    state.loadedSceneGraph,
    state.sceneHierarchySearchQuery,
    state.setSceneHierarchySearchQuery,
    state.sceneHierarchySearch,
    state.childrenByParent,
    state.childTaskByParent,
    state.loadingChildrenByParent,
    state.childErrorByParent,
    state.ensureSceneObjectChildrenLoaded,
    state.stopSceneObjectChildrenObservation,
  ]);

  const hierarchyGraphState = useMemo<SceneHierarchyGraphContextValue>(() => ({
    loadedSceneGraph: state.loadedSceneGraph,
    childrenByParent: state.childrenByParent,
  }), [state.childrenByParent, state.loadedSceneGraph]);

  const inspectorState = useMemo<SceneInspectorContextValue>(() => ({
    selectedObjectAddress: state.selectedObjectAddress,
    setSelectedObjectAddress: state.setSelectedObjectAddress,
    sceneTabs: state.sceneTabs,
    activeSceneTabIndex: state.activeSceneTabIndex,
    openTabForSceneObject: state.openTabForSceneObject,
    handleCloseTab: state.handleCloseTab,
    setActiveSceneTabIndex: state.setActiveSceneTabIndex,
    sceneInspector: state.sceneInspector,
    sceneInspectorHeaderTaskState: state.sceneInspectorHeaderTaskState,
    sceneInspectorComponentsTaskState: state.sceneInspectorComponentsTaskState,
    sceneInspectorComponentsPanel: state.sceneInspectorComponentsPanel,
    sceneInspectorLoading: state.sceneInspectorLoading,
    sceneInspectorChildrenLoading: state.sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading: state.sceneInspectorComponentsLoading,
    sceneInspectorError: state.sceneInspectorError,
    sceneInspectorComponentsError: state.sceneInspectorComponentsError,
    sceneObjectComponentsCapability: state.sceneObjectComponentsCapability,
  }), [
    state.selectedObjectAddress,
    state.setSelectedObjectAddress,
    state.sceneTabs,
    state.activeSceneTabIndex,
    state.openTabForSceneObject,
    state.handleCloseTab,
    state.setActiveSceneTabIndex,
    state.sceneInspector,
    state.sceneInspectorHeaderTaskState,
    state.sceneInspectorComponentsTaskState,
    state.sceneInspectorComponentsPanel,
    state.sceneInspectorLoading,
    state.sceneInspectorChildrenLoading,
    state.sceneInspectorComponentsLoading,
    state.sceneInspectorError,
    state.sceneInspectorComponentsError,
    state.sceneObjectComponentsCapability,
  ]);

  const mutationState = useMemo<SceneMutationContextValue>(() => ({
    createSceneRoot: state.createSceneRoot,
    createSceneChild: state.createSceneChild,
    duplicateSceneObject: state.duplicateSceneObject,
    deleteSceneObject: state.deleteSceneObject,
    renameSceneObject: state.renameSceneObject,
    setSceneObjectTag: state.setSceneObjectTag,
    setSceneObjectLayer: state.setSceneObjectLayer,
    setSceneObjectHideFlags: state.setSceneObjectHideFlags,
    reparentSceneObject: state.reparentSceneObject,
    setSceneObjectActive: state.setSceneObjectActive,
    setSceneObjectTransform: state.setSceneObjectTransform,
    setSceneBehaviourEnabled: state.setSceneBehaviourEnabled,
    createSceneComponent: state.createSceneComponent,
    deleteSceneComponent: state.deleteSceneComponent,
    loadSceneByBuildIndex: state.loadSceneByBuildIndex,
    sceneMutationState: state.sceneMutationState,
    isSceneMutationPending: state.isSceneMutationPending,
    activeSceneTask: state.activeSceneTask,
  }), [
    state.createSceneRoot,
    state.createSceneChild,
    state.duplicateSceneObject,
    state.deleteSceneObject,
    state.renameSceneObject,
    state.setSceneObjectTag,
    state.setSceneObjectLayer,
    state.setSceneObjectHideFlags,
    state.reparentSceneObject,
    state.setSceneObjectActive,
    state.setSceneObjectTransform,
    state.setSceneBehaviourEnabled,
    state.createSceneComponent,
    state.deleteSceneComponent,
    state.loadSceneByBuildIndex,
    state.sceneMutationState,
    state.isSceneMutationPending,
    state.activeSceneTask,
  ]);

  const mousePickerState = useMemo<SceneMousePickerContextValue>(() => ({
    scenePickerWindows: state.scenePickerWindows,
    scenePickerWindowsLoading: state.scenePickerWindowsLoading,
    scenePickerWindowsError: state.scenePickerWindowsError,
    sceneMousePickerState: state.sceneMousePickerState,
    refreshScenePickerWindows: state.refreshScenePickerWindows,
    setSceneMousePickerTarget: state.setSceneMousePickerTarget,
    startSceneMousePicker: state.startSceneMousePicker,
    stopSceneMousePicker: state.stopSceneMousePicker,
    openSceneMousePickHit: state.openSceneMousePickHit,
  }), [
    state.scenePickerWindows,
    state.scenePickerWindowsLoading,
    state.scenePickerWindowsError,
    state.sceneMousePickerState,
    state.refreshScenePickerWindows,
    state.setSceneMousePickerTarget,
    state.startSceneMousePicker,
    state.stopSceneMousePicker,
    state.openSceneMousePickHit,
  ]);

  return (
    <SceneTreeContext.Provider value={treeState}>
      <SceneHierarchyGraphContext.Provider value={hierarchyGraphState}>
        <SceneInspectorContext.Provider value={inspectorState}>
          <SceneMutationContext.Provider value={mutationState}>
            <SceneMousePickerContext.Provider value={mousePickerState}>
              {children}
            </SceneMousePickerContext.Provider>
          </SceneMutationContext.Provider>
        </SceneInspectorContext.Provider>
      </SceneHierarchyGraphContext.Provider>
    </SceneTreeContext.Provider>
  );
}

export function useSceneTreeState() {
  return useRequiredSceneContext(SceneTreeContext, 'useSceneTreeState');
}

export function useSceneHierarchyGraphState() {
  return useRequiredSceneContext(SceneHierarchyGraphContext, 'useSceneHierarchyGraphState');
}

export function useSceneInspectorState() {
  return useRequiredSceneContext(SceneInspectorContext, 'useSceneInspectorState');
}

export function useSceneMutationState() {
  return useRequiredSceneContext(SceneMutationContext, 'useSceneMutationState');
}

export function useSceneMousePickerState() {
  return useRequiredSceneContext(SceneMousePickerContext, 'useSceneMousePickerState');
}
