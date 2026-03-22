import React from 'react';
import { StudioProvider, useStudioGraph, useStudioUi } from '../../core/studio/StudioContext';
import { CanvasCore } from '../studio/canvas/CanvasCore';
import { StudioModalLayer } from '../studio/StudioModalLayer';
import { StudioToolbar } from '../studio/StudioToolbar';
import { useStudioPageFacade } from '../../app/facades/useStudioPageFacade';
import { useStudioPageController } from './useStudioPageController';

type PendingClassNode = ReturnType<typeof useStudioPageFacade>['pendingClassNode'];

export function StudioPage() {
  const { studioRuntimeData, pendingClassNode, clearPendingClassNode, workspaceLifecycle } = useStudioPageFacade();

  return (
    <StudioProvider runtimeData={studioRuntimeData} workspaceLifecycle={workspaceLifecycle}>
      <StudioPageContent
        pendingClassNode={pendingClassNode}
        onPendingClassNodeHandled={clearPendingClassNode}
      />
    </StudioProvider>
  );
}

function StudioPageContent({
  pendingClassNode,
  onPendingClassNodeHandled,
}: {
  pendingClassNode: PendingClassNode;
  onPendingClassNodeHandled?: () => void;
}) {
  const { addNode, undo, redo, saveWorkflow, deleteNodes, duplicateNodes } = useStudioGraph();
  const { canvasElement, transform, selectedNodeIds, clearSelectedNodes, setSelectedNodeIds } = useStudioUi();
  useStudioPageController({
    pendingClassNode,
    onPendingClassNodeHandled,
    canvasElement,
    transform,
    addNode,
    deleteNodes,
    duplicateNodes,
    selectedNodeIds,
    clearSelectedNodes,
    setSelectedNodeIds,
    saveWorkflow,
    undo,
    redo,
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f16] overflow-hidden relative">
      <StudioToolbar />
      <CanvasCore />
      <StudioModalLayer />
    </div>
  );
}
