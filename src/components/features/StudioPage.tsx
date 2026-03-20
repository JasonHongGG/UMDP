import React, { useEffect, useMemo, useRef } from 'react';
import { initializeStudioNodeRegistry } from '../../core/studio/NodeRegistry';
import { createEmptyClassInfoSelection } from '../../domain/studio/editor';
import { StudioProvider, useStudioGraph, useStudioUi } from '../../core/studio/StudioContext';
import { CanvasCore } from '../studio/canvas/CanvasCore';
import { StudioModalLayer } from '../studio/StudioModalLayer';
import { StudioToolbar } from '../studio/StudioToolbar';
import { studioNodeCatalog } from '../../nodes';
import { useAnalysisWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

type PendingClassNode = ReturnType<typeof useAnalysisWorkspace>['pendingClassNode'];

initializeStudioNodeRegistry(studioNodeCatalog);

const CLASS_NODE_CENTER_OFFSET = { x: 32, y: 44 };

function getViewportCenterPosition(
  canvasElement: HTMLDivElement,
  transform: { x: number; y: number; scale: number }
) {
  const rect = canvasElement.getBoundingClientRect();

  return {
    x: (rect.width / 2 - transform.x) / transform.scale - CLASS_NODE_CENTER_OFFSET.x,
    y: (rect.height / 2 - transform.y) / transform.scale - CLASS_NODE_CENTER_OFFSET.y,
  };
}

export function StudioPage() {
  const { studioRuntimeData, pendingClassNode, clearPendingClassNode } = useAnalysisWorkspace();

  return (
    <StudioProvider runtimeData={studioRuntimeData}>
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
  const handledPendingRequestIdsRef = useRef<Set<string>>(new Set());
  const copiedNodeIdsRef = useRef<string[]>([]);
  const pasteCountRef = useRef(1);

  const viewportCenterPosition = useMemo(() => {
    if (!canvasElement) {
      return null;
    }

    return getViewportCenterPosition(canvasElement, transform);
  }, [canvasElement, transform]);

  useEffect(() => {
    if (!pendingClassNode) return;

    if (handledPendingRequestIdsRef.current.has(pendingClassNode.requestId)) {
      onPendingClassNodeHandled?.();
      return;
    }

    if (!pendingClassNode.suggestedPosition && !viewportCenterPosition) {
      return;
    }

    handledPendingRequestIdsRef.current.add(pendingClassNode.requestId);

    addNode('class-ref', pendingClassNode.suggestedPosition ?? viewportCenterPosition!, {
      binding: pendingClassNode.binding,
      infoSelection: createEmptyClassInfoSelection(),
    });

    onPendingClassNodeHandled?.();
  }, [addNode, onPendingClassNodeHandled, pendingClassNode, viewportCenterPosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTypingTarget) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.length > 0) {
        event.preventDefault();
        deleteNodes(selectedNodeIds);
        clearSelectedNodes();
        return;
      }

      const isPrimaryModifierPressed = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifierPressed) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveWorkflow();
        return;
      }

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (key === 'c' && selectedNodeIds.length > 0) {
        event.preventDefault();
        copiedNodeIdsRef.current = [...selectedNodeIds];
        pasteCountRef.current = 1;
        return;
      }

      if (key === 'v' && copiedNodeIdsRef.current.length > 0) {
        event.preventDefault();
        const offset = 40 * pasteCountRef.current;
        const duplicatedNodeIds = duplicateNodes(copiedNodeIdsRef.current, { offset: { x: offset, y: offset } });
        if (duplicatedNodeIds.length > 0) {
          setSelectedNodeIds(duplicatedNodeIds);
          pasteCountRef.current += 1;
        }
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelectedNodes, deleteNodes, duplicateNodes, redo, saveWorkflow, selectedNodeIds, setSelectedNodeIds, undo]);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f16] overflow-hidden relative">
      <StudioToolbar />
      <CanvasCore />
      <StudioModalLayer />
    </div>
  );
}
