import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import type { GraphDocument } from '@/domain/studio/contracts';
import { createStudioNodeInitialData, hydrateStudioNodeData } from './NodeRegistry';
import { getRegisteredStudioNodeCatalog } from './catalog/studioNodeCatalogRuntime';
import type { StudioNodeCatalog } from './catalog/StudioNodeCatalog';
import {
  buildNodeInstance,
  connectionKeyToEdge,
  deriveStudioGraphCounters,
  type DuplicateNodesOptions,
  duplicateStudioGraphSelection,
  instanceToCanvasNode,
  isStudioGraphDocumentDirty,
  MAX_STUDIO_GRAPH_HISTORY_ENTRIES,
  pushStudioGraphHistoryEntry,
  resolveSourcePort,
} from './document/StudioDocumentEngine';
export {
  deriveStudioGraphCounters,
  duplicateStudioGraphSelection,
  isStudioGraphDocumentDirty,
  MAX_STUDIO_GRAPH_HISTORY_ENTRIES,
  pushStudioGraphHistoryEntry,
} from './document/StudioDocumentEngine';
import { initialStudioGraphState, reduceStudioGraphDocument, StudioGraphAction, studioGraphReducer } from './graphReducer';
import { localStudioGraphPersistenceGateway, type StudioGraphPersistenceGateway } from './StudioGraphPersistenceGateway';
import { BaseNodeData, ConnectPortsOptions, getConnectionChannelForPortType, NodeTransform, StudioEdge, StudioNode, StudioNodeDefinition } from './types';
import { useStudioGraphPersistence } from './useStudioGraphPersistence';

export interface UpdateNodePositionOptions {
  trackHistory?: boolean;
}

export type { DuplicateNodesOptions } from './document/StudioDocumentEngine';

export interface StudioGraphStore {
  nodes: StudioNode[];
  edges: StudioEdge[];
  document: GraphDocument;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  hasSavedWorkflow: boolean;
  lastSavedAt: number | null;
  lastLoadedAt: number | null;
  lastAutosavedAt: number | null;
  addNode: (typeId: string, position: NodeTransform, dataOverrides?: Partial<BaseNodeData>) => string | null;
  updateNodePosition: (id: string, position: NodeTransform, options?: UpdateNodePositionOptions) => void;
  updateNodePositions: (updates: Array<{ id: string; position: NodeTransform }>, options?: UpdateNodePositionOptions) => void;
  beginNodePositionSession: (nodeIds: string | string[]) => void;
  commitNodePositionSession: (nodeIds: string | string[]) => void;
  updateNodeData: (id: string, data: Partial<BaseNodeData>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[], options?: DuplicateNodesOptions) => string[];
  connectPorts: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectPortsOptions) => void;
  disconnectEdge: (id: string) => void;
  addEdge: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectPortsOptions) => void;
  deleteEdge: (id: string) => void;
  replaceDocument: (document: GraphDocument) => void;
  undo: () => void;
  redo: () => void;
  saveWorkflow: () => boolean;
  loadSavedWorkflow: () => boolean;
  clearWorkflow: () => void;
}

export function useStudioGraphStore(
  catalog: StudioNodeCatalog = getRegisteredStudioNodeCatalog(),
  persistenceGateway: StudioGraphPersistenceGateway = localStudioGraphPersistenceGateway,
): StudioGraphStore {
  const [graphState, dispatch] = useReducer(studioGraphReducer, initialStudioGraphState);
  const [pastDocuments, setPastDocuments] = useState<GraphDocument[]>([]);
  const [futureDocuments, setFutureDocuments] = useState<GraphDocument[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const dragHistorySnapshotsRef = useRef<Map<string, GraphDocument>>(new Map());
  const idCounter = useRef(1);
  const edgeCounter = useRef(1);

  const nodes = useMemo<StudioNode[]>(() => graphState.document.nodes
    .map((node) => instanceToCanvasNode(node, catalog))
    .filter((node): node is StudioNode => node !== null), [graphState.document.nodes]);
  const edges = useMemo<StudioEdge[]>(() => ([
    ...graphState.document.controlConnections.map((connection) => connectionKeyToEdge('control', connection)),
    ...graphState.document.dataConnections.map((connection) => connectionKeyToEdge('data', connection)),
  ]), [graphState.document.controlConnections, graphState.document.dataConnections]);
  const currentSerializedDocument = useMemo(
    () => persistenceGateway.serializeDocument(graphState.document),
    [graphState.document, persistenceGateway],
  );

  const syncCountersFromDocument = useCallback((document: GraphDocument) => {
    const { nextNodeCounter, nextEdgeCounter } = deriveStudioGraphCounters(document);
    idCounter.current = nextNodeCounter;
    edgeCounter.current = nextEdgeCounter;
  }, []);

  const pushDocumentIntoHistory = useCallback((document: GraphDocument) => {
    setPastDocuments((previous) => pushStudioGraphHistoryEntry(previous, document));
  }, []);

  const applyGraphAction = useCallback((action: StudioGraphAction, options?: { trackHistory?: boolean }) => {
    const nextDocument = reduceStudioGraphDocument(graphState.document, action);
    if (nextDocument === graphState.document) {
      return false;
    }

    if (options?.trackHistory !== false) {
      pushDocumentIntoHistory(graphState.document);
      setFutureDocuments([]);
    }

    dispatch(action);
    return true;
  }, [graphState.document, pushDocumentIntoHistory]);

  const replaceDocumentState = useCallback((document: GraphDocument, options?: { resetHistory?: boolean; loadedAt?: number | null }) => {
    const nextDocument = persistenceGateway.cloneDocument(document);

    dispatch({ type: 'replace-document', document: nextDocument });
    syncCountersFromDocument(nextDocument);

    if (options?.resetHistory) {
      setPastDocuments([]);
      setFutureDocuments([]);
    }

    if (typeof options?.loadedAt === 'number') {
      setLastLoadedAt(options.loadedAt);
    }
  }, [syncCountersFromDocument]);

  const {
    hasUnsavedChanges,
    hasSavedWorkflow,
    lastSavedAt,
    lastAutosavedAt,
    saveWorkflow,
    loadSavedWorkflow,
    clearWorkflow,
  } = useStudioGraphPersistence({
    document: graphState.document,
    persistenceGateway,
    replaceDocumentState,
  });

  const addNode = useCallback((typeId: string, position: NodeTransform, dataOverrides?: Partial<BaseNodeData>) => {
    const def = catalog.get(typeId);
    if (!def) {
      return null;
    }

    const nodeId = `${typeId}-${idCounter.current++}`;
    const newNode = buildNodeInstance(def, nodeId, position, createStudioNodeInitialData(def, dataOverrides));

    applyGraphAction({ type: 'add-node', node: newNode });
    return newNode.id;
  }, [applyGraphAction, catalog]);

  const updateNodePosition = useCallback((id: string, position: NodeTransform, options?: UpdateNodePositionOptions) => {
    applyGraphAction({ type: 'update-node-position', nodeId: id, position }, {
      trackHistory: options?.trackHistory,
    });
  }, [applyGraphAction]);

  const updateNodePositions = useCallback((updates: Array<{ id: string; position: NodeTransform }>, options?: UpdateNodePositionOptions) => {
    if (updates.length === 0) {
      return;
    }

    applyGraphAction({
      type: 'update-node-positions',
      updates: updates.map((entry) => ({ nodeId: entry.id, position: entry.position })),
    }, {
      trackHistory: options?.trackHistory,
    });
  }, [applyGraphAction]);

  const beginNodePositionSession = useCallback((nodeIds: string | string[]) => {
    const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    const snapshot = persistenceGateway.cloneDocument(graphState.document);
    ids.forEach((nodeId) => {
      dragHistorySnapshotsRef.current.set(nodeId, snapshot);
    });
  }, [graphState.document]);

  const commitNodePositionSession = useCallback((nodeIds: string | string[]) => {
    const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    const snapshot = ids
      .map((nodeId) => dragHistorySnapshotsRef.current.get(nodeId))
      .find((entry): entry is GraphDocument => Boolean(entry));

    ids.forEach((nodeId) => {
      dragHistorySnapshotsRef.current.delete(nodeId);
    });

    if (!snapshot) {
      return;
    }

    if (persistenceGateway.serializeDocument(snapshot) === currentSerializedDocument) {
      return;
    }

    pushDocumentIntoHistory(snapshot);
    setFutureDocuments([]);
  }, [currentSerializedDocument, pushDocumentIntoHistory]);

  const updateNodeData = useCallback((id: string, data: Partial<BaseNodeData>) => {
    const instance = graphState.document.nodes.find((node) => node.id === id);
    if (!instance) {
      return;
    }

    const def = catalog.get(instance.nodeType);
    if (!def) {
      return;
    }

    const currentData = hydrateStudioNodeData(def, instance);
    const nextData = {
      ...currentData,
      ...data,
    };
    const nextInstance = buildNodeInstance(def, instance.id, instance.position, nextData);
    applyGraphAction({ type: 'update-node-instance', nodeId: id, node: nextInstance });
  }, [applyGraphAction, catalog, graphState.document.nodes]);

  const deleteNode = useCallback((id: string) => {
    applyGraphAction({ type: 'delete-node', nodeId: id });
  }, [applyGraphAction]);

  const deleteNodes = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    applyGraphAction({ type: 'delete-nodes', nodeIds: ids });
  }, [applyGraphAction]);

  const duplicateNodes = useCallback((ids: string[], options?: DuplicateNodesOptions) => {
    if (ids.length === 0) {
      return [];
    }

    const { document: nextDocument, duplicatedNodeIds } = duplicateStudioGraphSelection(
      graphState.document,
      ids,
      (nodeType) => `${nodeType}-${idCounter.current++}`,
      () => `edge-${edgeCounter.current++}`,
      options,
    );

    if (duplicatedNodeIds.length === 0) {
      return [];
    }

    pushDocumentIntoHistory(graphState.document);
    setFutureDocuments([]);
    dispatch({ type: 'replace-document', document: nextDocument });

    return duplicatedNodeIds;
  }, [graphState.document, pushDocumentIntoHistory]);

  const connectPorts = useCallback((sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectPortsOptions) => {
    const sourcePort = resolveSourcePort(nodes, catalog, sourceNodeId, sourcePortId);
    if (!sourcePort) {
      return;
    }

    applyGraphAction({
      type: 'connect-ports',
      replaceEdgeIds: options?.replaceEdgeIds,
      edge: {
        id: `edge-${edgeCounter.current++}`,
        channel: getConnectionChannelForPortType(sourcePort.type),
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
      },
    });
  }, [applyGraphAction, catalog, nodes]);

  const disconnectEdge = useCallback((id: string) => {
    applyGraphAction({ type: 'disconnect-edge', edgeId: id });
  }, [applyGraphAction]);

  const replaceDocument = useCallback((document: GraphDocument) => {
    replaceDocumentState(document, { resetHistory: true });
  }, [replaceDocumentState]);

  const undo = useCallback(() => {
    const previous = pastDocuments[pastDocuments.length - 1];
    if (!previous) {
      return;
    }

    setPastDocuments((current) => current.slice(0, -1));
    setFutureDocuments((current) => [persistenceGateway.cloneDocument(graphState.document), ...current]);
    replaceDocumentState(previous, { loadedAt: Date.now() });
  }, [graphState.document, pastDocuments, persistenceGateway, replaceDocumentState]);

  const redo = useCallback(() => {
    const [next, ...remaining] = futureDocuments;
    if (!next) {
      return;
    }

    setFutureDocuments(remaining);
    pushDocumentIntoHistory(graphState.document);
    replaceDocumentState(next, { loadedAt: Date.now() });
  }, [futureDocuments, graphState.document, pushDocumentIntoHistory, replaceDocumentState]);

  return useMemo<StudioGraphStore>(() => ({
    nodes,
    edges,
    document: graphState.document,
    canUndo: pastDocuments.length > 0,
    canRedo: futureDocuments.length > 0,
    hasUnsavedChanges,
    hasSavedWorkflow,
    lastSavedAt,
    lastLoadedAt,
    lastAutosavedAt,
    addNode,
    updateNodePosition,
    updateNodePositions,
    beginNodePositionSession,
    commitNodePositionSession,
    updateNodeData,
    deleteNode,
    deleteNodes,
    duplicateNodes,
    connectPorts,
    disconnectEdge,
    addEdge: connectPorts,
    deleteEdge: disconnectEdge,
    replaceDocument,
    undo,
    redo,
    saveWorkflow,
    loadSavedWorkflow,
    clearWorkflow,
  }), [
    addNode,
    beginNodePositionSession,
    clearWorkflow,
    commitNodePositionSession,
    connectPorts,
    deleteNode,
    deleteNodes,
    duplicateNodes,
    disconnectEdge,
    edges,
    futureDocuments.length,
    graphState.document,
    hasSavedWorkflow,
    hasUnsavedChanges,
    lastAutosavedAt,
    lastLoadedAt,
    lastSavedAt,
    loadSavedWorkflow,
    nodes,
    pastDocuments.length,
    redo,
    replaceDocument,
    saveWorkflow,
    undo,
    updateNodeData,
    updateNodePosition,
    updateNodePositions,
  ]);
}