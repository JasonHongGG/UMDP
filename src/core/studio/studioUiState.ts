import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createInitialCanvasState } from '../../domain/studio/kernel';
import { reduceCanvasState } from '../../application/studio/kernel';
import { validateConnection } from './connectionPolicy';
import type { ConnectPortsOptions, DraftConnection, PortHandleType, PortType, StudioEdge, StudioNode } from './types';
import { getConnectionChannelForPortType, getPortTypeForConnectionChannel } from './types';

export interface StudioUiState {
  transform: { x: number; y: number; scale: number };
  setTransform: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
  canvasElement: HTMLDivElement | null;
  registerCanvasElement: (element: HTMLDivElement | null) => void;
  selectedNodeIds: string[];
  setSelectedNodeIds: (nodeIds: string[]) => void;
  selectSingleNode: (nodeId: string) => void;
  toggleSelectedNode: (nodeId: string) => void;
  clearSelectedNodes: () => void;
  registerNodeElement: (nodeId: string, element: HTMLDivElement | null) => void;
  getNodeElement: (nodeId: string) => HTMLDivElement | null;
  registerPortElement: (nodeId: string, portId: string, element: HTMLDivElement | null) => void;
  getPortElement: (nodeId: string, portId: string) => HTMLDivElement | null;
  draftConnection: DraftConnection | null;
  startConnection: (sourceNodeId: string, sourcePortId: string, sourcePortType: PortType, sourceHandleType: PortHandleType, startPos: { x: number; y: number }) => void;
  updateConnectionTarget: (targetPos: { x: number; y: number }, hoveredTargetNodeId?: string, hoveredTargetPortId?: string, hoveredTargetCompatible?: boolean) => void;
  finishConnection: (targetNodeId: string, targetPortId: string, targetPortType: PortType, targetHandleType: PortHandleType) => void;
  cancelConnection: () => void;
  isAddModalOpen: boolean;
  addModalPosition: { x: number; y: number } | null;
  openAddModal: (x: number, y: number) => void;
  closeAddModal: () => void;
  isEditModalOpen: boolean;
  editingNodeId: string | null;
  openEditModal: (nodeId: string) => void;
  closeEditModal: () => void;
}

interface UseStudioUiStateOptions {
  nodes: StudioNode[];
  edges: StudioEdge[];
  connectPorts: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectPortsOptions) => void;
}

export function useStudioUiState({ nodes, edges, connectPorts }: UseStudioUiStateOptions): StudioUiState {
  const [canvasState, dispatchCanvas] = useReducer(reduceCanvasState, undefined, createInitialCanvasState);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const portElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const transform = canvasState.viewport;
  const selectedNodeIds = canvasState.selectedNodeIds;
  const isAddModalOpen = canvasState.mode.kind === 'adding-node';
  const addModalPosition = canvasState.mode.kind === 'adding-node'
    ? { x: canvasState.mode.canvasX, y: canvasState.mode.canvasY }
    : null;
  const isEditModalOpen = canvasState.mode.kind === 'editing-node';
  const editingNodeId = canvasState.mode.kind === 'editing-node' ? canvasState.mode.nodeId : null;
  const draftConnection = useMemo<DraftConnection | null>(() => {
    if (canvasState.mode.kind !== 'connecting-edge') {
      return null;
    }

    return {
      sourceNodeId: canvasState.mode.draft.sourceNodeId,
      sourcePortId: canvasState.mode.draft.sourcePortKey,
      sourcePortType: getPortTypeForConnectionChannel(canvasState.mode.draft.sourceChannel),
      sourceConnectionChannel: canvasState.mode.draft.sourceChannel,
      sourceHandleType: 'source',
      targetPos: {
        x: canvasState.mode.draft.targetX,
        y: canvasState.mode.draft.targetY,
      },
      hoveredTargetNodeId: canvasState.mode.draft.hoveredTargetNodeId,
      hoveredTargetPortId: canvasState.mode.draft.hoveredTargetPortKey,
      hoveredTargetCompatible: canvasState.mode.draft.hoveredTargetCompatible,
    };
  }, [canvasState.mode]);

  useEffect(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const filteredNodeIds = canvasState.selectedNodeIds.filter((nodeId) => nodeIds.has(nodeId));
    if (filteredNodeIds.length !== canvasState.selectedNodeIds.length) {
      dispatchCanvas({ type: 'select-nodes', nodeIds: filteredNodeIds });
    }
  }, [canvasState.selectedNodeIds, nodes]);

  const setTransform: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>> = useCallback((nextValue) => {
    const nextTransform = typeof nextValue === 'function'
      ? nextValue(canvasState.viewport)
      : nextValue;
    dispatchCanvas({ type: 'set-viewport', viewport: nextTransform });
  }, [canvasState.viewport]);

  const startConnection = useCallback((sourceNodeId: string, sourcePortId: string, sourcePortType: PortType, sourceHandleType: PortHandleType, startPos: { x: number; y: number }) => {
    if (sourceHandleType !== 'source') {
      return;
    }

    dispatchCanvas({
      type: 'begin-connecting-edge',
      draft: {
        sourceNodeId,
        sourcePortKey: sourcePortId,
        sourceChannel: getConnectionChannelForPortType(sourcePortType),
        targetX: startPos.x,
        targetY: startPos.y,
      },
    });
  }, []);

  const updateConnectionTarget = useCallback((targetPos: { x: number; y: number }, hoveredTargetNodeId?: string, hoveredTargetPortId?: string, hoveredTargetCompatible?: boolean) => {
    dispatchCanvas({
      type: 'update-draft-edge-target',
      targetX: targetPos.x,
      targetY: targetPos.y,
      hoveredTargetNodeId,
      hoveredTargetPortKey: hoveredTargetPortId,
      hoveredTargetCompatible,
    });
  }, []);

  const finishConnection = useCallback((targetNodeId: string, targetPortId: string, targetPortType: PortType, targetHandleType: PortHandleType) => {
    if (!draftConnection) {
      return;
    }

    const validation = validateConnection({
      nodeId: draftConnection.sourceNodeId,
      portId: draftConnection.sourcePortId,
      portType: draftConnection.sourcePortType,
      handleType: draftConnection.sourceHandleType,
    }, {
      nodeId: targetNodeId,
      portId: targetPortId,
      portType: targetPortType,
      handleType: targetHandleType,
    }, nodes, edges);

    if (validation.valid) {
      connectPorts(draftConnection.sourceNodeId, draftConnection.sourcePortId, targetNodeId, targetPortId, {
        replaceEdgeIds: validation.replaceEdgeIds,
      });
    }

    dispatchCanvas({ type: 'return-to-idle' });
  }, [connectPorts, draftConnection, edges, nodes]);

  const cancelConnection = useCallback(() => {
    dispatchCanvas({ type: 'return-to-idle' });
  }, []);

  const registerCanvasElement = useCallback((element: HTMLDivElement | null) => {
    setCanvasElement(element);
  }, []);

  const setSelectedNodeIds = useCallback((nodeIds: string[]) => {
    const uniqueNodeIds = [...new Set(nodeIds)];
    dispatchCanvas({ type: 'select-nodes', nodeIds: uniqueNodeIds });
  }, []);

  const clearSelectedNodes = useCallback(() => {
    dispatchCanvas({ type: 'select-nodes', nodeIds: [] });
  }, []);

  const selectSingleNode = useCallback((nodeId: string) => {
    dispatchCanvas({ type: 'select-nodes', nodeIds: [nodeId] });
  }, []);

  const toggleSelectedNode = useCallback((nodeId: string) => {
    dispatchCanvas({
      type: 'select-nodes',
      nodeIds: selectedNodeIds.includes(nodeId)
        ? selectedNodeIds.filter((entry) => entry !== nodeId)
        : [...selectedNodeIds, nodeId],
    });
  }, [selectedNodeIds]);

  const registerNodeElement = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    if (!element) {
      nodeElementsRef.current.delete(nodeId);
      return;
    }

    nodeElementsRef.current.set(nodeId, element);
  }, []);

  const getNodeElement = useCallback((nodeId: string) => {
    return nodeElementsRef.current.get(nodeId) ?? null;
  }, []);

  const registerPortElement = useCallback((nodeId: string, portId: string, element: HTMLDivElement | null) => {
    const key = `${nodeId}:${portId}`;
    if (!element) {
      portElementsRef.current.delete(key);
      return;
    }

    portElementsRef.current.set(key, element);
  }, []);

  const getPortElement = useCallback((nodeId: string, portId: string) => {
    return portElementsRef.current.get(`${nodeId}:${portId}`) ?? null;
  }, []);

  const openAddModal = useCallback((x: number, y: number) => {
    dispatchCanvas({ type: 'begin-adding-node', canvasX: x, canvasY: y });
  }, []);

  const closeAddModal = useCallback(() => {
    dispatchCanvas({ type: 'return-to-idle' });
  }, []);

  const openEditModal = useCallback((nodeId: string) => {
    dispatchCanvas({ type: 'open-node-editor', nodeId });
  }, []);

  const closeEditModal = useCallback(() => {
    dispatchCanvas({ type: 'return-to-idle' });
  }, []);

  return useMemo(() => ({
    transform,
    setTransform,
    canvasElement,
    registerCanvasElement,
    selectedNodeIds,
    setSelectedNodeIds,
    selectSingleNode,
    toggleSelectedNode,
    clearSelectedNodes,
    registerNodeElement,
    getNodeElement,
    registerPortElement,
    getPortElement,
    draftConnection,
    startConnection,
    updateConnectionTarget,
    finishConnection,
    cancelConnection,
    isAddModalOpen,
    addModalPosition,
    openAddModal,
    closeAddModal,
    isEditModalOpen,
    editingNodeId,
    openEditModal,
    closeEditModal,
  }), [
    addModalPosition,
    cancelConnection,
    canvasElement,
    clearSelectedNodes,
    closeAddModal,
    closeEditModal,
    draftConnection,
    editingNodeId,
    finishConnection,
    getNodeElement,
    getPortElement,
    isAddModalOpen,
    isEditModalOpen,
    openAddModal,
    openEditModal,
    registerCanvasElement,
    registerNodeElement,
    registerPortElement,
    selectSingleNode,
    selectedNodeIds,
    setSelectedNodeIds,
    startConnection,
    toggleSelectedNode,
    transform,
    updateConnectionTarget,
  ]);
}