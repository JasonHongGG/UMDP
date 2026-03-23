import React, { useRef, useState } from 'react';
import { NodeExecutionSnapshot, NodeExecutionState, StudioNode } from '../../../core/studio/types';
import { useStudioNodeWrapperState } from '../../../application/studio/useStudioNodeWrapperState';
import { Trash2 } from 'lucide-react';

interface NodeWrapperProps {
  node: StudioNode;
  executionState?: NodeExecutionState;
  executionSnapshot?: NodeExecutionSnapshot | null;
  isRunActive?: boolean;
  children: React.ReactNode;
}

function resolveExecutionClass(executionState: NodeExecutionState, isRunActive: boolean) {
  if (executionState === 'running') {
    return 'ring-2 ring-emerald-400/80 shadow-[0_0_30px_rgba(52,211,153,0.28)]';
  }
  if (executionState === 'aborted') {
    return 'ring-2 ring-amber-300/70 shadow-[0_0_22px_rgba(251,191,36,0.18)]';
  }
  if (executionState === 'error') {
    return 'ring-2 ring-rose-400/75 shadow-[0_0_26px_rgba(244,63,94,0.25)]';
  }
  if (executionState === 'success' && isRunActive) {
    return 'ring-2 ring-cyan-400/65 shadow-[0_0_24px_rgba(34,211,238,0.18)]';
  }
  return '';
}

export function NodeWrapper({ node, executionState = 'idle', executionSnapshot = null, isRunActive = false, children }: NodeWrapperProps) {
  const { nodes, updateNodePosition, updateNodePositions, beginNodePositionSession, commitNodePositionSession, deleteNode, transform, openEditModal, selectedNodeIds, selectSingleNode, toggleSelectedNode, registerNodeElement } = useStudioNodeWrapperState();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const nodeStartPos = useRef({ x: 0, y: 0 });
  const selectedNodeStartPositions = useRef<Array<{ id: string; position: { x: number; y: number } }>>([]);
  const isSelected = selectedNodeIds.includes(node.id);
  const executionClass = resolveExecutionClass(executionState, isRunActive);
  const executionBadgeLabel = executionState === 'idle'
    ? null
    : executionState === 'running'
      ? executionSnapshot?.progress?.displayText ?? 'Running'
      : executionState === 'aborted'
        ? executionSnapshot?.abortReason === 'rerun'
          ? 'Aborted (rerun)'
          : executionSnapshot?.abortReason === 'workspace-reset'
            ? 'Aborted (workspace reset)'
            : executionSnapshot?.abortReason === 'document-reset'
              ? 'Aborted (document reset)'
              : executionSnapshot?.abortReason === 'component-dispose'
                ? 'Aborted (dispose)'
                : executionSnapshot?.errorMessage ?? 'Aborted'
      : executionState === 'success'
        ? 'Done'
        : executionSnapshot?.errorMessage ?? 'Error';

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
      className={`absolute top-0 left-0 transition-shadow rounded-2xl ${isDragging ? 'shadow-[0_15px_40px_rgba(34,211,238,0.2)] z-50' : 'z-10 hover:z-20'} ${isSelected ? 'ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-[#0a0f16]' : ''} ${executionClass}`}
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
      {executionBadgeLabel ? (
        <div className={`absolute -top-3 right-3 z-[95] max-w-[180px] truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${executionState === 'running' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : executionState === 'success' ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200' : executionState === 'aborted' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-rose-400/40 bg-rose-500/10 text-rose-200'}`}>
          {executionBadgeLabel}
        </div>
      ) : null}
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
