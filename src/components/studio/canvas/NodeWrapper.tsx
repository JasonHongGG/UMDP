import React, { useRef, useState } from 'react';
import { StudioNode } from '../../../core/studio/types';
import { useStudioGraph, useStudioUi } from '../../../core/studio/StudioContext';
import { Trash2 } from 'lucide-react';

interface NodeWrapperProps {
  node: StudioNode;
  children: React.ReactNode;
}

export function NodeWrapper({ node, children }: NodeWrapperProps) {
  const { updateNodePosition, beginNodePositionSession, commitNodePositionSession, deleteNode } = useStudioGraph();
  const { transform, openEditModal } = useStudioUi();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const nodeStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest('[data-studio-port="true"]') &&
      !target.closest('[data-studio-no-drag="true"]') &&
      !target.closest('[data-studio-toolbar="true"]')
    ) {
        e.stopPropagation();
        setIsDragging(true);
        beginNodePositionSession(node.id);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        nodeStartPos.current = { ...node.position };
        nodeRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();

    // Calculate actual canvas movement applying scale factor
    const dx = (e.clientX - dragStartPos.current.x) / transform.scale;
    const dy = (e.clientY - dragStartPos.current.y) / transform.scale;

    updateNodePosition(node.id, {
      x: nodeStartPos.current.x + dx,
      y: nodeStartPos.current.y + dy,
    }, { trackHistory: false });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      e.stopPropagation();
      setIsDragging(false);
      commitNodePositionSession(node.id);
      nodeRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEditModal(node.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode(node.id);
  };

  return (
    <div
      ref={nodeRef}
      className={`absolute top-0 left-0 transition-shadow ${isDragging ? 'shadow-[0_15px_40px_rgba(34,211,238,0.2)] z-50' : 'z-10 hover:z-20'}`}
      style={{
        transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* n8n-style Hover Toolbar - rendered above node layer */}
      <div data-studio-no-drag="true" data-studio-toolbar="true" className={`absolute bottom-full left-1/2 -translate-x-1/2 z-[100] pb-1 transition-all duration-150 ${isHovered && !isDragging ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"
            title="Delete Node"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
