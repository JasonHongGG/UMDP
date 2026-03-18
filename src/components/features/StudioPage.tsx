import React, { useEffect, useMemo, useRef } from 'react';
import { initializeStudioNodeRegistry } from '../../core/studio/NodeRegistry';
import {
  buildStudioClassCatalog,
  createEmptyClassInfoSelection,
  createPendingClassNodeRequest,
  type ClassBinding,
  type ClassInfoCatalog,
  type PendingClassNodeRequest,
} from '../../domain/studio/editor';
import { StudioProvider, useStudioGraph, useStudioUi } from '../../core/studio/StudioContext';
import { CanvasCore } from '../studio/canvas/CanvasCore';
import { StudioModalLayer } from '../studio/StudioModalLayer';
import { StudioToolbar } from '../studio/StudioToolbar';
import { studioNodeCatalog } from '../../nodes';
import type { AnalysisClassSummary, AnalysisImageInfo } from '../../domain/analysis/view-models';

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

interface StudioPageProps {
  pendingClassNode?: PendingClassNodeRequest | null;
  images: AnalysisImageInfo[];
  classesByImage: Record<string, AnalysisClassSummary[]>;
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  onOpenInspectorForBinding?: (binding: ClassBinding) => void;
  onPendingClassNodeHandled?: () => void;
}

export function StudioPage({
  pendingClassNode,
  images,
  classesByImage,
  classInfoCatalogByStableId,
  onOpenInspectorForBinding,
  onPendingClassNodeHandled,
}: StudioPageProps) {
  const classCatalog = useMemo(() => {
    const classes = buildStudioClassCatalog(images, classesByImage);
    return {
      classes,
      createNodeRequestFromBinding: (binding: ClassBinding, suggestedPosition?: { x: number; y: number }) => {
        const catalog = classInfoCatalogByStableId[binding.classStableId];
        if (!catalog) {
          return null;
        }

        return createPendingClassNodeRequest(binding, catalog, suggestedPosition);
      },
      getClassInfoCatalogByBinding: (binding: ClassBinding | null | undefined) => {
        if (!binding) {
          return null;
        }

        return classInfoCatalogByStableId[binding.classStableId] ?? null;
      },
      openInspectorForBinding: onOpenInspectorForBinding,
    };
  }, [classInfoCatalogByStableId, classesByImage, images, onOpenInspectorForBinding]);

  return (
    <StudioProvider classCatalog={classCatalog}>
      <StudioPageContent
        pendingClassNode={pendingClassNode}
        images={images}
        classesByImage={classesByImage}
        classInfoCatalogByStableId={classInfoCatalogByStableId}
        onOpenInspectorForBinding={onOpenInspectorForBinding}
        onPendingClassNodeHandled={onPendingClassNodeHandled}
      />
    </StudioProvider>
  );
}

function StudioPageContent({
  pendingClassNode,
  images,
  classesByImage,
  classInfoCatalogByStableId,
  onOpenInspectorForBinding,
  onPendingClassNodeHandled,
}: StudioPageProps) {
  const { addNode, undo, redo, saveWorkflow } = useStudioGraph();
  const { canvasElement, transform } = useStudioUi();
  const handledPendingRequestIdsRef = useRef<Set<string>>(new Set());

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
    <div className="flex-1 flex flex-col bg-[#0a0f16] overflow-hidden relative">
      <StudioToolbar />
      <CanvasCore />
      <StudioModalLayer />
    </div>
  );
}
