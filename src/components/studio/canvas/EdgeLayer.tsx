import React, { useCallback, useLayoutEffect, useState } from 'react';
import { getStudioNodePort, getStudioNodePorts } from '../../../core/studio/NodeRegistry';
import { useStudioEdgeLayerState } from '../../../application/studio/useStudioEdgeLayerState';
import { NodeExecutionSnapshot, NodeExecutionState, PORT_COLORS, PortType, StudioEdge, StudioNode } from '../../../core/studio/types';

export function isEdgeExecutionActive(
  edge: StudioEdge,
  nodeStates: Record<string, NodeExecutionState>,
  nodeSnapshots: Record<string, NodeExecutionSnapshot>,
) {
  const targetState = nodeStates[edge.targetNodeId] ?? 'idle';
  if (targetState !== 'running') {
    return false;
  }

  const targetSnapshot = nodeSnapshots[edge.targetNodeId];
  if (!targetSnapshot) {
    return false;
  }

  if (edge.channel === 'control') {
    const sourceSnapshot = nodeSnapshots[edge.sourceNodeId];
    if (!sourceSnapshot) {
      return false;
    }

    if (sourceSnapshot.nextControlPorts === undefined) {
      return true;
    }

    return sourceSnapshot.nextControlPorts.includes(edge.sourcePortId);
  }

  const sourceEnvelope = nodeSnapshots[edge.sourceNodeId]?.outputs[edge.sourcePortId];
  if (!sourceEnvelope) {
    return false;
  }

  return (targetSnapshot.inputs[edge.targetPortId] ?? []).some((envelope) => envelope === sourceEnvelope);
}

export function getEdgeColor(
  edge: StudioEdge,
  nodes: StudioNode[],
  nodeStates: Record<string, NodeExecutionState>,
) {
  const sourceState = nodeStates[edge.sourceNodeId] ?? 'idle';
  if (sourceState === 'aborted') {
    return '#fbbf24';
  }
  if (sourceState === 'error') {
    return '#fb7185';
  }

  const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
  const port = getStudioNodePort(sourceNode, 'output', edge.sourcePortId) || getStudioNodePort(sourceNode, 'input', edge.sourcePortId);
  const type = port?.type || 'json';
  return PORT_COLORS[type as PortType];
}

export function EdgeLayer() {
  const { edges, nodes, disconnectEdge, nodeStates, nodeSnapshots, transform, draftConnection, canvasElement, getPortElement } = useStudioEdgeLayerState();
  const [portPositions, setPortPositions] = useState<Record<string, { x: number, y: number }>>({});

  const resolvePortPosition = useCallback((nodeId: string, portId: string) => {
    const key = `${nodeId}-${portId}`;
    const cached = portPositions[key];
    if (cached) {
      return cached;
    }

    if (!canvasElement) {
      return null;
    }

    const portElement = getPortElement(nodeId, portId);
    if (!portElement) {
      return null;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const rect = portElement.getBoundingClientRect();
    const screenX = rect.left + rect.width / 2;
    const screenY = rect.top + rect.height / 2;

    return {
      x: (screenX - canvasRect.left - transform.x) / transform.scale,
      y: (screenY - canvasRect.top - transform.y) / transform.scale,
    };
  }, [canvasElement, getPortElement, portPositions, transform]);

  const updatePortPositions = useCallback(() => {
    const rawSpots: Record<string, { x: number, y: number }> = {};
    if (!canvasElement) {
      setPortPositions({});
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    nodes.forEach((node) => {
      const ports = [...getStudioNodePorts(node, 'input'), ...getStudioNodePorts(node, 'output')];
      ports.forEach((port) => {
        const el = getPortElement(node.id, port.id);
        if (!el) {
          return;
        }

      const rect = el.getBoundingClientRect();
        const screenX = rect.left + rect.width / 2;
        const screenY = rect.top + rect.height / 2;

        const canvasX = (screenX - canvasRect.left - transform.x) / transform.scale;
        const canvasY = (screenY - canvasRect.top - transform.y) / transform.scale;

        rawSpots[`${node.id}-${port.id}`] = { x: canvasX, y: canvasY };
      });
    });

    setPortPositions(rawSpots);
  }, [canvasElement, getPortElement, nodes, transform]);

  useLayoutEffect(() => {
    updatePortPositions();
  }, [updatePortPositions]);

  useLayoutEffect(() => {
    if (!draftConnection) {
      return;
    }

    updatePortPositions();
  }, [draftConnection, updatePortPositions]);

  useLayoutEffect(() => {
    const handleResize = () => updatePortPositions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePortPositions]);

  const createBezierPath = (startX: number, startY: number, endX: number, endY: number) => {
    // If start is roughly to the right of end, force a wider curve loop
    const controlPointX = Math.max(Math.abs(endX - startX) / 2, 50);
    return `M ${startX} ${startY} C ${startX + controlPointX} ${startY}, ${endX - controlPointX} ${endY}, ${endX} ${endY}`;
  };

  const renderDraftConnection = () => {
    if (!draftConnection) return null;

    const start = resolvePortPosition(draftConnection.sourceNodeId, draftConnection.sourcePortId);
    if (!start) return null;

    const end = draftConnection.targetPos;
    const pathString = createBezierPath(start.x, start.y, end.x, end.y);
    const color = draftConnection.hoveredTargetCompatible === false ? '#ef4444' : PORT_COLORS[draftConnection.sourcePortType];

    return (
      <g>
        <path
          d={pathString}
          fill="none"
          stroke={color}
          strokeWidth={2}
          className="pointer-events-none"
          strokeDasharray="5 5"
          strokeLinecap="round"
          style={{ animation: 'studio-edge-dash 0.55s linear infinite' }}
        />
        <path
          d={pathString}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeOpacity={0.3}
          className="blur-sm pointer-events-none"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r={4}
          fill={color}
          className="pointer-events-none animate-pulse"
        />
      </g>
    );
  };

  return (
    <svg className="absolute inset-0 pointer-events-none w-full h-full min-w-[5000px] min-h-[5000px]" style={{ overflow: 'visible' }}>
      {edges.map(edge => {
        const start = resolvePortPosition(edge.sourceNodeId, edge.sourcePortId);
        const end = resolvePortPosition(edge.targetNodeId, edge.targetPortId);

        if (!start || !end) return null;

        const pathId = `edge-path-${edge.id}`;
        const pathString = createBezierPath(start.x, start.y, end.x, end.y);
        const isActive = isEdgeExecutionActive(edge, nodeStates, nodeSnapshots);
        const color = getEdgeColor(edge, nodes, nodeStates);

        return (
          <g key={edge.id}>
            <path
              d={pathString}
              fill="none"
              stroke="transparent"
              strokeWidth={15}
              className="pointer-events-auto cursor-pointer"
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); disconnectEdge(edge.id); }}
            />
            <path
              d={pathString}
              fill="none"
              stroke={color}
              strokeOpacity={isActive ? 0.55 : 0.3}
              strokeWidth={isActive ? 8 : 6}
              className="blur-sm pointer-events-none"
            />
            <path
              id={pathId}
              d={pathString}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 3 : 2}
              className="pointer-events-none"
              strokeDasharray={isActive ? '7 6' : undefined}
              style={isActive ? { animation: 'studio-edge-dash 0.55s linear infinite' } : undefined}
            />
          </g>
        );
      })}
      {renderDraftConnection()}
    </svg>
  );
}
