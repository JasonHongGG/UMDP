import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useStudioGraph, useStudioRuntime, useStudioUi } from '../../../core/studio/StudioContext';
import { useAnalysisWorkspace } from '../../../domain/analysis/AnalysisWorkspaceContext';
import { NodeLayer } from './NodeLayer';
import { EdgeLayer } from './EdgeLayer';

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function CanvasCore() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { nodes } = useStudioGraph();
  const { activeRun } = useStudioRuntime();
  const { transform, setTransform, openAddModal, registerCanvasElement, clearSelectedNodes, setSelectedNodeIds, getNodeElement } = useStudioUi();
  const { workspaceLifecycle } = useAnalysisWorkspace();
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

  const buildSelectionRect = useCallback((startX: number, startY: number, endX: number, endY: number): SelectionRect => ({
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }), []);

  const selectNodesInRect = useCallback((rect: SelectionRect) => {
    if (!wrapperRef.current) {
      return;
    }

    const wrapperBounds = wrapperRef.current.getBoundingClientRect();
    const selectedIds = nodes.flatMap((node) => {
      const element = getNodeElement(node.id);
      if (!element) {
        return [];
      }

      const nodeBounds = element.getBoundingClientRect();
      const relativeBounds = {
        left: nodeBounds.left - wrapperBounds.left,
        top: nodeBounds.top - wrapperBounds.top,
        right: nodeBounds.right - wrapperBounds.left,
        bottom: nodeBounds.bottom - wrapperBounds.top,
      };
      const intersects = !(
        relativeBounds.right < rect.left ||
        relativeBounds.left > rect.left + rect.width ||
        relativeBounds.bottom < rect.top ||
        relativeBounds.top > rect.top + rect.height
      );

      return intersects ? [node.id] : [];
    });

    setSelectedNodeIds(selectedIds);
  }, [getNodeElement, nodes, setSelectedNodeIds]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) {
      return;
    }

    e.preventDefault();
    if (!wrapperRef.current) return;

    const zoomSensitivity = 0.001;
    const { left, top } = wrapperRef.current.getBoundingClientRect();
    const mouseX = e.clientX - left;
    const mouseY = e.clientY - top;

    setTransform((prev) => {
      // Calculate zoom delta
      const delta = -e.deltaY * zoomSensitivity;
      let newScale = prev.scale * Math.exp(delta);
      // Clamp scale
      newScale = Math.max(0.1, Math.min(newScale, 3));

      // Calculate new offset to zoom towards mouse cursor
      const scaleRatio = newScale / prev.scale;
      const newX = mouseX - (mouseX - prev.x) * scaleRatio;
      const newY = mouseY - (mouseY - prev.y) * scaleRatio;

      return { x: newX, y: newY, scale: newScale };
    });
  }, [setTransform]);

  useEffect(() => {
    const el = wrapperRef.current;
    registerCanvasElement(el);
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        el.removeEventListener('wheel', handleWheel);
        registerCanvasElement(null);
      };
    }
    return undefined;
  }, [handleWheel, registerCanvasElement]);

  // Handle Right Mouse Pan
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) { // Right click
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      wrapperRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0 || !wrapperRef.current) {
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest('[data-studio-node="true"]') || target.closest('[data-studio-port="true"]') || target.closest('[data-studio-toolbar="true"]')) {
      return;
    }

    const bounds = wrapperRef.current.getBoundingClientRect();
    const startX = e.clientX - bounds.left;
    const startY = e.clientY - bounds.top;
    selectionStartRef.current = { x: startX, y: startY };
    setSelectionRect({ left: startX, top: startY, width: 0, height: 0 });
    clearSelectedNodes();
    wrapperRef.current.setPointerCapture(e.pointerId);
  };

  const handleSelectionMove = useCallback((clientX: number, clientY: number) => {
    if (!selectionStartRef.current || !wrapperRef.current) {
      return;
    }

    const bounds = wrapperRef.current.getBoundingClientRect();
    const currentX = clientX - bounds.left;
    const currentY = clientY - bounds.top;
    const nextRect = buildSelectionRect(selectionStartRef.current.x, selectionStartRef.current.y, currentX, currentY);
    setSelectionRect(nextRect);
    selectNodesInRect(nextRect);
  }, [buildSelectionRect, selectNodesInRect]);

  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    handleSelectionMove(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      wrapperRef.current?.releasePointerCapture(e.pointerId);
      return;
    }

    if (selectionStartRef.current) {
      selectionStartRef.current = null;
      setSelectionRect(null);
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  // Handle Add Node via Double Click
  const handleDoubleClick = (e: React.MouseEvent) => {
    // The target is either the wrapper itself or the full-screen transform-gpu div covering it.
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains('transform-gpu') || target.tagName.toLowerCase() === 'svg') {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        
        // Convert screen coordinates to canvas coordinates based on transform
        const canvasX = (screenX - transform.x) / transform.scale;
        const canvasY = (screenY - transform.y) / transform.scale;

        openAddModal(canvasX, canvasY); // Open modal with intended canvas drop coordinates
      }
    }
  };

  return (
    <div 
      ref={wrapperRef}
      className={`w-full h-full relative overflow-hidden bg-[#0a0f16] ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMoveCapture}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Background SVG Grid that pans and scales */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern 
            id="dot-grid" 
            x={transform.x} 
            y={transform.y} 
            width={24 * transform.scale} 
            height={24 * transform.scale} 
            patternUnits="userSpaceOnUse"
          >
            <circle cx={2 * transform.scale} cy={2 * transform.scale} r={1.5 * transform.scale} fill="#1c2838" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* The transformed layer containing all nodes and edges */}
      <div 
        className="absolute inset-0 transform-gpu"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: '0 0' }}
      >
        <EdgeLayer />
        <NodeLayer />
      </div>

      <div className="absolute bottom-4 right-4 z-20 pointer-events-none flex flex-col items-end gap-2">
        <div className="rounded-full border border-slate-800/80 bg-[#071018]/88 backdrop-blur-xl px-3 py-1.5 text-[11px] text-slate-300 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          {workspaceLifecycle.runtime === 'unknown' ? 'Runtime Unknown' : `Runtime ${String(workspaceLifecycle.runtime).toUpperCase()}`}
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-[11px] shadow-[0_12px_30px_rgba(0,0,0,0.35)] ${activeRun ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-800/80 bg-[#071018]/88 text-slate-400'}`}>
          {activeRun ? `Running ${activeRun.startNodeId} · ${activeRun.status}` : 'Canvas Idle'}
        </div>
      </div>

      {selectionRect ? (
        <div
          className="absolute pointer-events-none border border-cyan-400/80 bg-cyan-400/10 z-30 rounded-sm"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      ) : null}
    </div>
  );
}
