import React from 'react';
import { StudioProviders } from '@/features/studio/application/StudioProviders';
import { useStudioPageState } from '@/features/studio/application/useStudioPageState';
import { useStudioWorkspace } from '@/domain/analysis/AnalysisWorkspaceContext';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import { CanvasCore } from '@/features/studio/components/canvas/CanvasCore';
import { StudioModalLayer } from '@/features/studio/components/StudioModalLayer';
import { StudioToolbar } from '@/features/studio/components/StudioToolbar';
import { useStudioPageController } from './useStudioPageController';

export function StudioPage() {
  const { studioRuntimeData, pendingClassNode, clearPendingClassNode, workspaceLifecycle } = useStudioWorkspace();

  return (
    <StudioProviders runtimeData={studioRuntimeData} workspaceLifecycle={workspaceLifecycle}>
      <StudioPageContent
        pendingClassNode={pendingClassNode}
        onPendingClassNodeHandled={clearPendingClassNode}
      />
    </StudioProviders>
  );
}

function StudioPageContent({
  pendingClassNode,
  onPendingClassNodeHandled,
}: {
  pendingClassNode: PendingClassNodeRequest | null;
  onPendingClassNodeHandled?: () => void;
}) {
  const { addNode, undo, redo, saveWorkflow, deleteNodes, duplicateNodes, canvasElement, transform, selectedNodeIds, clearSelectedNodes, setSelectedNodeIds } = useStudioPageState();
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
