import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useStudioUi } from '../../../core/studio/StudioContext';
import { NodeLayer } from './NodeLayer';
import { EdgeLayer } from './EdgeLayer';

export function CanvasCore() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { transform, setTransform, openAddModal, registerCanvasElement } = useStudioUi();
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
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
      onPointerMove={handlePointerMove}
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
    </div>
  );
}
