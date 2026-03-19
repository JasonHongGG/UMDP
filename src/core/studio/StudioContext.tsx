import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpressionReferenceDragPayload, GraphDocument } from '../../domain/studio/contracts';
import type { StableId } from '../../domain/contracts/shared-identity';
import {
  type ClassInfoCatalog,
  hasSameClassInfoSelection,
  reconcileClassInfoSelection,
  type ClassBinding,
  type ClassInfoSelection,
  type PendingClassNodeRequest,
  type StudioClassCatalogEntry,
} from '../../domain/studio/editor';
import { validateConnection } from './connectionPolicy';
import { executeStudioFlow } from './executionEngine';
import { StudioGraphStore, useStudioGraphStore } from './graphStore';
import type { ConnectPortsOptions, DraftConnection, NodeExecutionSnapshot, NodeExecutionState, PortHandleType, PortType, StudioEdge, StudioNode } from './types';
import { getConnectionChannelForPortType } from './types';

const StudioGraphContext = createContext<StudioGraphStore | null>(null);
const StudioUiContext = createContext<StudioUiState | null>(null);
const StudioRuntimeContext = createContext<StudioRuntimeState | null>(null);
const StudioClassCatalogContext = createContext<StudioClassCatalogState | null>(null);

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
  activeExpressionDrag: ExpressionReferenceDragPayload | null;
  expressionDragPosition: { x: number; y: number } | null;
  beginExpressionDrag: (payload: ExpressionReferenceDragPayload, position: { x: number; y: number }) => void;
  updateExpressionDrag: (position: { x: number; y: number }) => void;
  endExpressionDrag: () => void;
}

export interface StudioRuntimeState {
  nodeStates: Record<string, NodeExecutionState>;
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  executeFlow: (startNodeId: string) => void;
}

interface UseStudioUiStateOptions {
  nodes: StudioNode[];
  edges: StudioEdge[];
  connectPorts: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectPortsOptions) => void;
}

function useStudioUiState({ nodes, edges, connectPorts }: UseStudioUiStateOptions): StudioUiState {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalPosition, setAddModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [activeExpressionDrag, setActiveExpressionDrag] = useState<ExpressionReferenceDragPayload | null>(null);
  const [expressionDragPosition, setExpressionDragPosition] = useState<{ x: number; y: number } | null>(null);
  const portElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

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

  const beginExpressionDrag = useCallback((payload: ExpressionReferenceDragPayload, position: { x: number; y: number }) => {
    setActiveExpressionDrag(payload);
    setExpressionDragPosition(position);
  }, []);

  const updateExpressionDrag = useCallback((position: { x: number; y: number }) => {
    setExpressionDragPosition(position);
  }, []);

  const endExpressionDrag = useCallback(() => {
    setActiveExpressionDrag(null);
    setExpressionDragPosition(null);
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
    activeExpressionDrag,
    expressionDragPosition,
    beginExpressionDrag,
    updateExpressionDrag,
    endExpressionDrag,
  }), [
    activeExpressionDrag,
    addModalPosition,
    beginExpressionDrag,
    cancelConnection,
    canvasElement,
    closeAddModal,
    closeEditModal,
    draftConnection,
    editingNodeId,
    endExpressionDrag,
    expressionDragPosition,
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
    updateExpressionDrag,
    updateConnectionTarget,
  ]);
}

function useStudioRuntimeState(document: GraphDocument, nodes: StudioNode[], edges: StudioEdge[], classCatalog: StudioClassCatalogState): StudioRuntimeState {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [nodeSnapshots, setNodeSnapshots] = useState<Record<string, NodeExecutionSnapshot>>({});
  const executionCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      executionCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    executionCleanupRef.current?.();
    setNodeStates({});
    setNodeSnapshots({});
  }, [document]);

  const executeFlow = useCallback((startNodeId: string) => {
    executionCleanupRef.current?.();
    executionCleanupRef.current = executeStudioFlow({
      documentId: document.id,
      startNodeId,
      nodes,
      edges,
      resolveStaticFieldAddress: classCatalog.resolveStaticFieldAddress,
      onReset: () => {
        setNodeStates({});
        setNodeSnapshots({});
      },
      onNodeStateChange: (nodeId, state) => {
        setNodeStates((previous) => ({ ...previous, [nodeId]: state }));
      },
      onNodeSnapshot: (snapshot) => {
        setNodeSnapshots((previous) => ({ ...previous, [snapshot.nodeId]: snapshot }));
      },
    });
  }, [classCatalog, document.id, edges, nodes]);

  return useMemo(() => ({
    nodeStates,
    nodeSnapshots,
    executeFlow,
  }), [executeFlow, nodeSnapshots, nodeStates]);
}

export interface StudioClassCatalogState {
  classes: StudioClassCatalogEntry[];
  createNodeRequestFromBinding: (binding: ClassBinding, suggestedPosition?: { x: number; y: number }) => PendingClassNodeRequest | null;
  getClassInfoCatalogByBinding: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null;
  resolveStaticFieldAddress: (classStableId: string, memberStableId: string) => string | null;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  openInspectorForBinding?: (binding: ClassBinding) => void;
}

export function useStudioGraph() {
  const context = useContext(StudioGraphContext);
  if (!context) {
    throw new Error('useStudioGraph must be used within a StudioProvider');
  }

  return context;
}

export function useStudioUi() {
  const context = useContext(StudioUiContext);
  if (!context) {
    throw new Error('useStudioUi must be used within a StudioProvider');
  }

  return context;
}

export function useStudioRuntime() {
  const context = useContext(StudioRuntimeContext);
  if (!context) {
    throw new Error('useStudioRuntime must be used within a StudioProvider');
  }

  return context;
}

export function useStudioClassCatalog() {
  const context = useContext(StudioClassCatalogContext);
  if (!context) {
    throw new Error('useStudioClassCatalog must be used within a StudioProvider');
  }

  return context;
}

export function useStudio() {
  return {
    ...useStudioGraph(),
    ...useStudioUi(),
    ...useStudioRuntime(),
    ...useStudioClassCatalog(),
  };
}

export function StudioProvider({ children, classCatalog }: { children: React.ReactNode; classCatalog: StudioClassCatalogState }) {
  const graphStore = useStudioGraphStore();
  const { nodes, edges, document, connectPorts } = graphStore;
  const uiValue = useStudioUiState({ nodes, edges, connectPorts });
  const runtimeValue = useStudioRuntimeState(document, nodes, edges, classCatalog);

  useEffect(() => {
    for (const node of nodes) {
      if (node.type !== 'class-ref') {
        continue;
      }

      const data = node.data as Partial<{ binding: ClassBinding | null }>;
      if (!data.binding) {
        continue;
      }

      classCatalog.ensureRuntimeOverlayLoaded(data.binding.classStableId);
    }
  }, [classCatalog, nodes]);

  useEffect(() => {
    for (const node of nodes) {
      if (node.type !== 'class-ref') {
        continue;
      }

      const data = node.data as Partial<{
        binding: ClassBinding | null;
        infoSelection: ClassInfoSelection;
      }>;

      if (!data.binding || !data.infoSelection) {
        continue;
      }

      const resolvedCatalog = classCatalog.getClassInfoCatalogByBinding(data.binding);
      if (!resolvedCatalog) {
        continue;
      }

      const reconciledSelection = reconcileClassInfoSelection(data.infoSelection, resolvedCatalog);
      const selectionChanged = !hasSameClassInfoSelection(data.infoSelection, reconciledSelection);

      if (!selectionChanged) {
        continue;
      }

      graphStore.updateNodeData(node.id, {
        infoSelection: reconciledSelection,
      });
    }
  }, [classCatalog, graphStore, nodes]);

  return (
    <StudioGraphContext.Provider value={graphStore}>
      <StudioUiContext.Provider value={uiValue}>
        <StudioRuntimeContext.Provider value={runtimeValue}>
          <StudioClassCatalogContext.Provider value={classCatalog}>
            {children}
          </StudioClassCatalogContext.Provider>
        </StudioRuntimeContext.Provider>
      </StudioUiContext.Provider>
    </StudioGraphContext.Provider>
  );
}