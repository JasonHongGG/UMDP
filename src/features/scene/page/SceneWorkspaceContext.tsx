import React, { createContext, useContext } from 'react';
import { useAnalysisRepository } from '@/domain/analysis/hooks/useAnalysisRepository';
import { useWorkspaceShellState } from '@/domain/analysis/AnalysisWorkspaceContext';
import { useSceneWorkspaceState, type SceneWorkspaceStateResult } from './useSceneWorkspaceState';

const SceneWorkspaceContext = createContext<SceneWorkspaceStateResult | null>(null);

export function SceneWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const repository = useAnalysisRepository();
  const { workspaceLifecycle, activePage } = useWorkspaceShellState();
  const state = useSceneWorkspaceState({
    repository,
    workspaceLifecycle,
    active: activePage === 'scene',
  });

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
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
  } = useSceneWorkspace();

  return {
    selectedObjectAddress,
    setSelectedObjectAddress,
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
  };
}

export function useSceneMutationState() {
  const {
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    createSceneComponent,
    deleteSceneComponent,
    sceneMutationState,
  } = useSceneWorkspace();

  return {
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    createSceneComponent,
    deleteSceneComponent,
    sceneMutationState,
  };
}
