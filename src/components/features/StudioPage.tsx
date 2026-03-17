import React, { useEffect, useMemo, useRef } from 'react';
import { initializeStudioNodeRegistry } from '../../core/studio/NodeRegistry';
import { StudioClassCatalogProvider } from '../../core/studio/StudioClassCatalogContext';
import { createEmptyClassInfoSelection } from '../../core/studio/classCatalog';
import { PendingClassNodeRequest, ClassBinding } from '../../core/studio/types';
import { useStudioGraph, useStudioUi } from '../../core/studio/StudioContext';
import { CanvasCore } from '../studio/canvas/CanvasCore';
import { StudioModalLayer } from '../studio/StudioModalLayer';
import { StudioToolbar } from '../studio/StudioToolbar';
import { studioNodeCatalog } from '../../nodes';
import type { ClassInfo, ClassSummary, ImageInfo } from '../../types';

initializeStudioNodeRegistry(studioNodeCatalog);

const DEFAULT_CLASS_NODE_POSITION = { x: 160, y: 120 };

interface StudioPageProps {
  pendingClassNode?: PendingClassNodeRequest | null;
  images: ImageInfo[];
  classesByImage: Record<string, ClassSummary[]>;
  classDetailsByKey: Record<string, ClassInfo>;
  onOpenInspectorForBinding?: (binding: ClassBinding) => void;
  onPendingClassNodeHandled?: () => void;
}

export function StudioPage({
  pendingClassNode,
  images,
  classesByImage,
  classDetailsByKey,
  onOpenInspectorForBinding,
  onPendingClassNodeHandled,
}: StudioPageProps) {
  const { addNode, undo, redo, saveWorkflow } = useStudioGraph();
  const { canvasElement, transform } = useStudioUi();
  const handledPendingRequestIdsRef = useRef<Set<string>>(new Set());

  const viewportCenterPosition = useMemo(() => {
    if (!canvasElement) {
      return DEFAULT_CLASS_NODE_POSITION;
    }

    const rect = canvasElement.getBoundingClientRect();
    return {
      x: (rect.width / 2 - transform.x) / transform.scale,
      y: (rect.height / 2 - transform.y) / transform.scale,
    };
  }, [canvasElement, transform]);

  useEffect(() => {
    if (!pendingClassNode) return;

    if (handledPendingRequestIdsRef.current.has(pendingClassNode.requestId)) {
      onPendingClassNodeHandled?.();
      return;
    }

    handledPendingRequestIdsRef.current.add(pendingClassNode.requestId);

    addNode('class-ref', pendingClassNode.suggestedPosition ?? viewportCenterPosition, {
      binding: pendingClassNode.binding,
      availableInfo: pendingClassNode.availableInfo,
      infoSelection: createEmptyClassInfoSelection(),
    });

    onPendingClassNodeHandled?.();
  }, [addNode, onPendingClassNodeHandled, pendingClassNode, viewportCenterPosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTypingTarget) {
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

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, saveWorkflow, undo]);

  return (
    <StudioClassCatalogProvider
      images={images}
      classesByImage={classesByImage}
      classDetailsByKey={classDetailsByKey}
      onOpenInspectorForBinding={onOpenInspectorForBinding}
    >
      <div className="flex-1 flex flex-col bg-[#0a0f16] overflow-hidden relative">
        <StudioToolbar />
        <CanvasCore />
        <StudioModalLayer />
      </div>
    </StudioClassCatalogProvider>
  );
}
