import React from 'react';
import { StudioProviders } from '@/features/studio/application/StudioProviders';
import { useStudioPageState } from '@/features/studio/application/useStudioPageState';
import { useAnalysisWorkspace } from '@/app/state/useAnalysisWorkspace';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import { CanvasCore } from '@/features/studio/components/canvas/CanvasCore';
import { StudioModalLayer } from '@/features/studio/components/StudioModalLayer';
import { StudioToolbar } from '@/features/studio/components/StudioToolbar';
import { useStudioRuntimeDataModel } from '@/features/studio/application/useStudioRuntimeDataModel';
import { useStudioPageController } from './useStudioPageController';
import { WorkspaceGate } from '@/shared/ui/WorkspaceGate';

export function StudioPage() {
  const studioRuntimeData = useStudioRuntimeDataModel();
  const { pendingClassNode, clearPendingClassNode } = useAnalysisWorkspace();
  const { workspaceLifecycle, workspacePresentation } = useWorkspaceShellState();
  const detail = workspacePresentation.pages.studio;

  if (detail.blocked) {
    return <WorkspaceGate detail={detail} />;
  }

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
