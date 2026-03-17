import { useCallback, useMemo, useRef, useState } from 'react';
import { validateConnection } from './connectionPolicy';
import { DraftConnection, PortHandleType, PortType, StudioEdge, StudioNode } from './types';

export interface StudioUiState {
  transform: { x: number; y: number; scale: number };
  setTransform: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
  canvasElement: HTMLDivElement | null;
  registerCanvasElement: (element: HTMLDivElement | null) => void;
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
  connectPorts: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => void;
}

export function useStudioUiState({ nodes, edges, connectPorts }: UseStudioUiStateOptions): StudioUiState {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalPosition, setAddModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const portElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const startConnection = useCallback((sourceNodeId: string, sourcePortId: string, sourcePortType: PortType, sourceHandleType: PortHandleType, startPos: { x: number; y: number }) => {
    if (sourceHandleType !== 'source') {
      return;
    }

    setDraftConnection({ sourceNodeId, sourcePortId, sourcePortType, sourceHandleType, targetPos: startPos });
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
        connectPorts(previous.sourceNodeId, previous.sourcePortId, targetNodeId, targetPortId);
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
    closeAddModal,
    closeEditModal,
    draftConnection,
    editingNodeId,
    finishConnection,
    getPortElement,
    isAddModalOpen,
    isEditModalOpen,
    openAddModal,
    openEditModal,
    registerCanvasElement,
    registerPortElement,
    startConnection,
    transform,
    updateConnectionTarget,
  ]);
}
