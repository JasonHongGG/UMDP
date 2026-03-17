import React, { useCallback } from 'react';
import { IPort, PORT_COLORS, PortHandleType, PortType } from '../../../core/studio/types';
import { validateConnection } from '../../../core/studio/connectionPolicy';
import { useStudioGraph, useStudioUi } from '../../../core/studio/StudioContext';

interface PortProps {
  nodeId: string;
  port: IPort;
  type: 'target' | 'source'; // target = Input, source = Output
}

export function Port({ nodeId, port, type }: PortProps) {
  const { nodes, edges } = useStudioGraph();
  const {
    startConnection,
    finishConnection,
    cancelConnection,
    draftConnection,
    updateConnectionTarget,
    transform,
    canvasElement,
    registerPortElement,
  } = useStudioUi();

  const resolveCanvasElement = () => canvasElement || document.body;

  const resolvePortElement = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    return hit?.closest('[data-studio-port="true"]') as HTMLElement | null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    const canvasEl = resolveCanvasElement();
    const canvasRect = canvasEl.getBoundingClientRect();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = rect.left + rect.width / 2;
    const screenY = rect.top + rect.height / 2;
    
    const canvasX = (screenX - canvasRect.left - transform.x) / transform.scale;
    const canvasY = (screenY - canvasRect.top - transform.y) / transform.scale;

    startConnection(nodeId, port.id, port.type, type, { x: canvasX, y: canvasY });
  }, [nodeId, port.id, port.type, startConnection, transform, type]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draftConnection?.sourcePortId === port.id && draftConnection.sourceNodeId === nodeId) {
      e.stopPropagation();
      const canvasEl = resolveCanvasElement();
      const rect = canvasEl.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
      const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
      
      // Detect what port element is under the cursor
      const oldPE = (e.currentTarget as HTMLElement).style.pointerEvents;
      (e.currentTarget as HTMLElement).style.pointerEvents = 'none';
      const portEl = resolvePortElement(e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).style.pointerEvents = oldPE;

      let hoveredTargetNodeId: string | undefined;
      let hoveredTargetPortId: string | undefined;
      let hoveredTargetCompatible: boolean | undefined;

      if (portEl) {
        hoveredTargetNodeId = portEl.getAttribute('data-node-id') || undefined;
        hoveredTargetPortId = portEl.getAttribute('data-port-id') || undefined;
        const targetPortType = portEl.getAttribute('data-port-type') as PortType | null;
        const targetHandleType = portEl.getAttribute('data-handle-type') as PortHandleType | null;

        if (hoveredTargetNodeId && targetPortType && targetHandleType) {
          hoveredTargetCompatible = validateConnection({
            nodeId: draftConnection.sourceNodeId,
            portId: draftConnection.sourcePortId,
            portType: draftConnection.sourcePortType,
            handleType: draftConnection.sourceHandleType,
          }, {
            nodeId: hoveredTargetNodeId,
            portId: hoveredTargetPortId ?? '',
            portType: targetPortType,
            handleType: targetHandleType,
          }, nodes, edges).valid;
        } else {
          hoveredTargetNodeId = undefined;
          hoveredTargetPortId = undefined;
        }
      }

      updateConnectionTarget({ x: canvasX, y: canvasY }, hoveredTargetNodeId, hoveredTargetPortId, hoveredTargetCompatible);
    }
  }, [draftConnection, edges, nodeId, nodes, port.id, transform, updateConnectionTarget]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (draftConnection?.sourcePortId === port.id && draftConnection.sourceNodeId === nodeId) {
        const oldVal = (e.currentTarget as HTMLElement).style.pointerEvents;
        (e.currentTarget as HTMLElement).style.pointerEvents = 'none';
      const portEl = resolvePortElement(e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).style.pointerEvents = oldVal;
        if (portEl) {
            const targetNodeId = portEl.getAttribute('data-node-id');
            const targetPortId = portEl.getAttribute('data-port-id');
            const targetPortType = portEl.getAttribute('data-port-type') as PortType;
            const targetHandleType = portEl.getAttribute('data-handle-type') as PortHandleType;

            if (targetNodeId && targetPortId && targetPortType && targetHandleType) {
              finishConnection(targetNodeId, targetPortId, targetPortType, targetHandleType);
                return;
            }
        }
        cancelConnection();
    }
  }, [cancelConnection, draftConnection, finishConnection, nodeId, port.id]);

  // Am I the hovered target right now?
  const isHoveredTarget = draftConnection?.hoveredTargetNodeId === nodeId && draftConnection?.hoveredTargetPortId === port.id;
  const isCompatible = isHoveredTarget && draftConnection?.hoveredTargetCompatible;
  const isIncompatible = isHoveredTarget && !draftConnection?.hoveredTargetCompatible;

  // Use the color assigned to this port type
  const color = PORT_COLORS[port.type];
  
  // Size and style based on hover state
  const outerSize = isHoveredTarget ? 'w-5 h-5' : 'w-3 h-3';
  const innerSize = isHoveredTarget ? 'w-5 h-5' : 'w-3 h-3 hover:scale-125';

  return (
    <div className={`relative flex items-center justify-center group/port z-40 transition-all duration-200 ${outerSize}`}>
      <div 
        ref={(element) => registerPortElement(nodeId, port.id, element)}
        className={`rounded-full border-2 cursor-crosshair transition-all duration-200 z-50 ${innerSize}`}
        style={{ 
            backgroundColor: isCompatible ? color : isIncompatible ? '#ef4444' : '#1e293b', 
            borderColor: isIncompatible ? '#ef4444' : color,
            boxShadow: isCompatible ? `0 0 15px ${color}` : isIncompatible ? '0 0 15px #ef4444' : `0 0 5px ${color}80`,
        }}
        data-studio-port="true"
        data-node-id={nodeId}
        data-port-id={port.id}
        data-port-type={port.type}
        data-handle-type={type}
        
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {/* Port Label (Always Visible) */}
      <div className={`absolute top-1/2 -translate-y-1/2 ${type === 'source' ? 'left-full ml-2' : 'right-full mr-2'} pointer-events-none whitespace-nowrap z-50`}>
        <span style={{ color: isCompatible ? '#fff' : isIncompatible ? '#ef4444' : color }} className="text-[10px] font-medium">{port.label}</span>
      </div>
    </div>
  );
}

