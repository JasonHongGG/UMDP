import React from 'react';
import { StudioProviders } from '@/features/studio/application/StudioProviders';
import { useStudioPageState } from '@/features/studio/application/useStudioPageState';
import { useStudioHandoff } from '@/app/state/useStudioHandoff';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import { CanvasCore } from '@/features/studio/components/canvas/CanvasCore';
import { StudioModalLayer } from '@/features/studio/components/StudioModalLayer';
import { StudioToolbar } from '@/features/studio/components/StudioToolbar';
import { useStudioRuntimeDataModel } from '@/features/studio/application/useStudioRuntimeDataModel';
import { useStudioPageController } from './useStudioPageController';
import { WorkspaceGate } from '@/shared/ui/WorkspaceGate';
import type { WorkspacePageDetail } from '@/domain/workspace/presentation';

export function StudioPage() {
  const studioRuntimeData = useStudioRuntimeDataModel();
  const { pendingClassNode, clearPendingClassNode } = useStudioHandoff();
  const { workspaceLifecycle, workspacePresentation } = useWorkspaceShellState();
  const detail = workspacePresentation.pages.studio;

  if (detail.blocked) {
    return <WorkspaceGate detail={detail} />;
  }

  return (
    <StudioProviders runtimeData={studioRuntimeData} workspaceLifecycle={workspaceLifecycle}>
      <StudioPageContent
        detail={detail}
        pendingClassNode={pendingClassNode}
        onPendingClassNodeHandled={clearPendingClassNode}
      />
    </StudioProviders>
  );
}

function StudioPageContent({
  detail,
  pendingClassNode,
  onPendingClassNodeHandled,
}: {
  detail: WorkspacePageDetail;
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
      {detail.systemState === 'runtime-degraded' ? (
        <div className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-3 text-amber-100">
          <div className="text-[10px] uppercase tracking-[0.26em] text-amber-300/80">{detail.badge}</div>
          <div className="mt-1 text-sm font-semibold">{detail.title}</div>
          <div className="mt-1 text-xs leading-5 text-amber-100/80">{detail.description}</div>
        </div>
      ) : null}
      <StudioToolbar />
      <CanvasCore />
      <StudioModalLayer />
    </div>
  );
}
