import React, { createContext, useContext, useEffect } from 'react';
import { useSceneGateway } from '@/domain/scene/hooks/useSceneGateway';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { useSceneWorkspaceState, type SceneWorkspaceStateResult } from './useSceneWorkspaceState';

const SceneWorkspaceContext = createContext<SceneWorkspaceStateResult | null>(null);

export function SceneWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const repository = useSceneGateway();
  const { workspaceLifecycle, activePage, setWorkspaceTasks } = useWorkspaceShellState();
  const state = useSceneWorkspaceState({
    repository,
    workspaceLifecycle,
    active: activePage === 'scene',
  });

  useEffect(() => {
    setWorkspaceTasks('scene', state.sceneTasks);
    return () => {
      setWorkspaceTasks('scene', []);
    };
  }, [setWorkspaceTasks, state.sceneTasks]);

  return (
    <SceneWorkspaceContext.Provider value={state}>
      {children}
    </SceneWorkspaceContext.Provider>
  );
}

export function useSceneWorkspace() {
  const context = useContext(SceneWorkspaceContext);
  if (!context) {
    throw new Error('useSceneWorkspace must be used within SceneWorkspaceProvider');
  }

  return context;
}

export function useSceneTreeState() {
  const {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    openTabForSceneObject,
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
  } = useSceneWorkspace();

  return {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    openTabForSceneObject,
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
  };
}

export function useSceneInspectorState() {
  const {
    selectedObjectAddress,
    setSelectedObjectAddress,
    sceneTabs,
    activeSceneTabIndex,
    openTabForSceneObject,
    handleCloseTab,
    setActiveSceneTabIndex,
    sceneInspector,
    sceneInspectorHeaderTaskState,
    sceneInspectorComponentsTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    sceneInspectorComponentsError,
  } = useSceneWorkspace();

  return {
    selectedObjectAddress,
    setSelectedObjectAddress,
    sceneTabs,
    activeSceneTabIndex,
    openTabForSceneObject,
    handleCloseTab,
    setActiveSceneTabIndex,
    sceneInspector,
    sceneInspectorHeaderTaskState,
    sceneInspectorComponentsTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    sceneInspectorComponentsError,
  };
}

export function useSceneMutationState() {
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
    sceneMutationState,
    isSceneMutationPending,
    activeSceneTask,
  } = useSceneWorkspace();

  return {
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
    activeSceneTask,
  };
}

export function useSceneMousePickerState() {
  const {
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
    openSceneMousePickHit,
  } = useSceneWorkspace();

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
