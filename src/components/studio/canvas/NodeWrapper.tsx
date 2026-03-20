import React, { useRef, useState } from 'react';
import { StudioNode } from '../../../core/studio/types';
import { useStudioGraph, useStudioUi } from '../../../core/studio/StudioContext';
import { Trash2 } from 'lucide-react';

interface NodeWrapperProps {
  node: StudioNode;
  children: React.ReactNode;
}

export function NodeWrapper({ node, children }: NodeWrapperProps) {
  const { nodes, updateNodePosition, updateNodePositions, beginNodePositionSession, commitNodePositionSession, deleteNode } = useStudioGraph();
  const { transform, openEditModal, selectedNodeIds, selectSingleNode, toggleSelectedNode, registerNodeElement } = useStudioUi();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const nodeStartPos = useRef({ x: 0, y: 0 });
  const selectedNodeStartPositions = useRef<Array<{ id: string; position: { x: number; y: number } }>>([]);
  const isSelected = selectedNodeIds.includes(node.id);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest('[data-studio-port="true"]') &&
      !target.closest('[data-studio-no-drag="true"]') &&
      !target.closest('[data-studio-toolbar="true"]')
    ) {
      e.stopPropagation();

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        toggleSelectedNode(node.id);
        return;
      }

      const draggingNodeIds = isSelected && selectedNodeIds.length > 1 ? selectedNodeIds : [node.id];
      if (!isSelected || selectedNodeIds.length <= 1) {
        selectSingleNode(node.id);
      }

      setIsDragging(true);
      beginNodePositionSession(draggingNodeIds);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      nodeStartPos.current = { ...node.position };
      selectedNodeStartPositions.current = draggingNodeIds.map((nodeId) => ({
        id: nodeId,
        position: nodes.find((entry) => entry.id === nodeId)?.position ?? { x: 0, y: 0 },
      }));
      nodeRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();

    // Calculate actual canvas movement applying scale factor
    const dx = (e.clientX - dragStartPos.current.x) / transform.scale;
    const dy = (e.clientY - dragStartPos.current.y) / transform.scale;

    if (selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1) {
      updateNodePositions(selectedNodeStartPositions.current.map((entry) => ({
        id: entry.id,
        position: {
          x: entry.position.x + dx,
          y: entry.position.y + dy,
        },
      })), { trackHistory: false });
      return;
    }

    updateNodePosition(node.id, {
      x: nodeStartPos.current.x + dx,
      y: nodeStartPos.current.y + dy,
    }, { trackHistory: false });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      e.stopPropagation();
      setIsDragging(false);
      commitNodePositionSession(isSelected && selectedNodeIds.length > 1 ? selectedNodeIds : node.id);
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
      data-studio-node="true"
      className={`absolute top-0 left-0 transition-shadow rounded-2xl ${isDragging ? 'shadow-[0_15px_40px_rgba(34,211,238,0.2)] z-50' : 'z-10 hover:z-20'} ${isSelected ? 'ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-[#0a0f16]' : ''}`}
      style={{
        transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
      }}
      ref={(element) => {
        nodeRef.current = element;
        registerNodeElement(node.id, element);
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
