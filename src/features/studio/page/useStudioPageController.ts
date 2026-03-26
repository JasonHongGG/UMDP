import { useEffect, useMemo, useRef } from 'react';
import { createEmptyClassInfoSelection } from '@/domain/studio/editor';

const CLASS_NODE_CENTER_OFFSET = { x: 32, y: 44 };

interface PendingClassNodeRequest {
  requestId: string;
  binding: unknown;
  suggestedPosition?: { x: number; y: number } | null;
}

interface UseStudioPageControllerOptions {
  pendingClassNode: PendingClassNodeRequest | null;
  onPendingClassNodeHandled?: () => void;
  canvasElement: HTMLDivElement | null;
  transform: { x: number; y: number; scale: number };
  addNode: (typeId: string, position: { x: number; y: number }, dataOverrides?: Record<string, unknown>) => string | null;
  deleteNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[], options?: { offset?: { x: number; y: number } }) => string[];
  selectedNodeIds: string[];
  clearSelectedNodes: () => void;
  setSelectedNodeIds: (ids: string[]) => void;
  saveWorkflow: () => boolean;
  undo: () => void;
  redo: () => void;
}

function getViewportCenterPosition(
  canvasElement: HTMLDivElement,
  transform: { x: number; y: number; scale: number },
) {
  const rect = canvasElement.getBoundingClientRect();

  return {
    x: (rect.width / 2 - transform.x) / transform.scale - CLASS_NODE_CENTER_OFFSET.x,
    y: (rect.height / 2 - transform.y) / transform.scale - CLASS_NODE_CENTER_OFFSET.y,
  };
}

export function useStudioPageController({
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
}: UseStudioPageControllerOptions) {
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
    if (!pendingClassNode) {
      return;
    }

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

  return {
    viewportCenterPosition,
  };
}
