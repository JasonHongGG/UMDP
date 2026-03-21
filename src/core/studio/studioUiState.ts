import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateConnection } from './connectionPolicy';
import type { ConnectPortsOptions, DraftConnection, PortHandleType, PortType, StudioEdge, StudioNode } from './types';
import { getConnectionChannelForPortType } from './types';

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
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [selectedNodeIds, setSelectedNodeIdsState] = useState<string[]>([]);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalPosition, setAddModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const portElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    setSelectedNodeIdsState((previous) => previous.filter((nodeId) => nodeIds.has(nodeId)));
  }, [nodes]);

  const startConnection = useCallback((sourceNodeId: string, sourcePortId: string, sourcePortType: PortType, sourceHandleType: PortHandleType, startPos: { x: number; y: number }) => {
    if (sourceHandleType !== 'source') {
      return;
    }

    setDraftConnection({
      sourceNodeId,
      sourcePortId,
      sourcePortType,
      sourceConnectionChannel: getConnectionChannelForPortType(sourcePortType),
      sourceHandleType,
      targetPos: startPos,
    });
  }, []);

  const updateConnectionTarget = useCallback((targetPos: { x: number; y: number }, hoveredTargetNodeId?: string, hoveredTargetPortId?: string, hoveredTargetCompatible?: boolean) => {
    setDraftConnection((previous) => previous
      ? { ...previous, targetPos, hoveredTargetNodeId, hoveredTargetPortId, hoveredTargetCompatible }
      : null);
  }, []);

  const finishConnection = useCallback((targetNodeId: string, targetPortId: string, targetPortType: PortType, targetHandleType: PortHandleType) => {
    setDraftConnection((previous) => {
      if (!previous) {
        return null;
      }

      const validation = validateConnection({
        nodeId: previous.sourceNodeId,
        portId: previous.sourcePortId,
        portType: previous.sourcePortType,
        handleType: previous.sourceHandleType,
      }, {
        nodeId: targetNodeId,
        portId: targetPortId,
        portType: targetPortType,
        handleType: targetHandleType,
      }, nodes, edges);

      if (validation.valid) {
        connectPorts(previous.sourceNodeId, previous.sourcePortId, targetNodeId, targetPortId, {
          replaceEdgeIds: validation.replaceEdgeIds,
        });
      }

      return null;
    });
  }, [connectPorts, edges, nodes]);

  const cancelConnection = useCallback(() => {
    setDraftConnection(null);
  }, []);

  const registerCanvasElement = useCallback((element: HTMLDivElement | null) => {
    setCanvasElement(element);
  }, []);

  const setSelectedNodeIds = useCallback((nodeIds: string[]) => {
    const uniqueNodeIds = [...new Set(nodeIds)];
    setSelectedNodeIdsState(uniqueNodeIds);
  }, []);

  const clearSelectedNodes = useCallback(() => {
    setSelectedNodeIdsState([]);
  }, []);

  const selectSingleNode = useCallback((nodeId: string) => {
    setSelectedNodeIdsState([nodeId]);
  }, []);

  const toggleSelectedNode = useCallback((nodeId: string) => {
    setSelectedNodeIdsState((previous) => previous.includes(nodeId)
      ? previous.filter((entry) => entry !== nodeId)
      : [...previous, nodeId]);
  }, []);

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
    setAddModalPosition({ x, y });
    setIsAddModalOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
  }, []);

  const openEditModal = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
    setIsEditModalOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
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