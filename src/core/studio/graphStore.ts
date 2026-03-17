import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createStudioNodeInitialData, globalNodeRegistry } from './NodeRegistry';
import { initialStudioGraphState, reduceStudioGraphDocument, StudioGraphAction, studioGraphReducer } from './graphReducer';
import {
  cloneWorkflowDocument,
  createEmptyWorkflowDocument,
  readStoredWorkflowDocument,
  serializeWorkflowDocument,
  STUDIO_WORKFLOW_AUTOSAVE_KEY,
  STUDIO_WORKFLOW_MANUAL_SAVE_KEY,
  writeStoredWorkflowDocument,
} from './persistence';
import { BaseNodeData, IPort, NodeTransform, StudioEdge, StudioNode, WorkflowDocument } from './types';

export const MAX_STUDIO_GRAPH_HISTORY_ENTRIES = 100;

const EMPTY_WORKFLOW_SNAPSHOT = serializeWorkflowDocument(createEmptyWorkflowDocument());

export interface UpdateNodePositionOptions {
  trackHistory?: boolean;
}

export interface StudioGraphStore {
  nodes: StudioNode[];
  edges: StudioEdge[];
  document: WorkflowDocument;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  hasSavedWorkflow: boolean;
  lastSavedAt: number | null;
  lastLoadedAt: number | null;
  lastAutosavedAt: number | null;
  addNode: (typeId: string, position: NodeTransform, dataOverrides?: Partial<BaseNodeData>) => string | null;
  updateNodePosition: (id: string, position: NodeTransform, options?: UpdateNodePositionOptions) => void;
  beginNodePositionSession: (nodeId: string) => void;
  commitNodePositionSession: (nodeId: string) => void;
  updateNodeData: (id: string, data: Partial<BaseNodeData>) => void;
  updateNodePorts: (id: string, inputs: IPort[], outputs: IPort[]) => void;
  deleteNode: (id: string) => void;
  connectPorts: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => void;
  disconnectEdge: (id: string) => void;
  addEdge: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => void;
  deleteEdge: (id: string) => void;
  replaceDocument: (document: WorkflowDocument) => void;
  undo: () => void;
  redo: () => void;
  saveWorkflow: () => boolean;
  loadSavedWorkflow: () => boolean;
  clearWorkflow: () => void;
}

export function deriveStudioGraphCounters(document: WorkflowDocument) {
  const nextNodeCounter = document.nodes.reduce((highest, node) => {
    const match = node.id.match(/-(\d+)$/);
    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]) + 1);
  }, 1);

  const nextEdgeCounter = document.edges.reduce((highest, edge) => {
    const match = edge.id.match(/^edge-(\d+)$/);
    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]) + 1);
  }, 1);

  return {
    nextNodeCounter,
    nextEdgeCounter,
  };
}

export function isStudioGraphDocumentDirty(document: WorkflowDocument, savedDocumentSnapshot: string | null) {
  const currentSerializedDocument = serializeWorkflowDocument(document);
  if (savedDocumentSnapshot === null) {
    return currentSerializedDocument !== EMPTY_WORKFLOW_SNAPSHOT;
  }

  return currentSerializedDocument !== savedDocumentSnapshot;
}

export function pushStudioGraphHistoryEntry(history: WorkflowDocument[], document: WorkflowDocument, limit = MAX_STUDIO_GRAPH_HISTORY_ENTRIES) {
  const next = [...history, cloneWorkflowDocument(document)];
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }

  return next;
}

export function useStudioGraphStore(): StudioGraphStore {
  const [graphState, dispatch] = useReducer(studioGraphReducer, initialStudioGraphState);
  const [pastDocuments, setPastDocuments] = useState<WorkflowDocument[]>([]);
  const [futureDocuments, setFutureDocuments] = useState<WorkflowDocument[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [hasSavedWorkflow, setHasSavedWorkflow] = useState(false);
  const [savedDocumentSnapshot, setSavedDocumentSnapshot] = useState<string | null>(null);
  const dragHistorySnapshotsRef = useRef<Map<string, WorkflowDocument>>(new Map());
  const hasHydratedPersistenceRef = useRef(false);
  const idCounter = useRef(1);
  const edgeCounter = useRef(1);

  const nodes = graphState.document.nodes;
  const edges = graphState.document.edges;
  const currentSerializedDocument = useMemo(() => serializeWorkflowDocument(graphState.document), [graphState.document]);
  const hasUnsavedChanges = useMemo(() => isStudioGraphDocumentDirty(graphState.document, savedDocumentSnapshot), [graphState.document, savedDocumentSnapshot]);

  const syncCountersFromDocument = useCallback((document: WorkflowDocument) => {
    const { nextNodeCounter, nextEdgeCounter } = deriveStudioGraphCounters(document);
    idCounter.current = nextNodeCounter;
    edgeCounter.current = nextEdgeCounter;
  }, []);

  const pushDocumentIntoHistory = useCallback((document: WorkflowDocument) => {
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

  const replaceDocumentState = useCallback((document: WorkflowDocument, options?: { resetHistory?: boolean; loadedAt?: number | null }) => {
    const nextDocument = cloneWorkflowDocument(document);

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

  useEffect(() => {
    const manualRecord = readStoredWorkflowDocument(STUDIO_WORKFLOW_MANUAL_SAVE_KEY);
    if (manualRecord) {
      setHasSavedWorkflow(true);
      setLastSavedAt(manualRecord.savedAt);
      setSavedDocumentSnapshot(serializeWorkflowDocument(manualRecord.document));
    }

    const autosaveRecord = readStoredWorkflowDocument(STUDIO_WORKFLOW_AUTOSAVE_KEY);
    if (autosaveRecord) {
      replaceDocumentState(autosaveRecord.document, {
        resetHistory: true,
        loadedAt: autosaveRecord.savedAt,
      });
      setLastAutosavedAt(autosaveRecord.savedAt);
    } else {
      syncCountersFromDocument(initialStudioGraphState.document);
    }

    hasHydratedPersistenceRef.current = true;
  }, [replaceDocumentState, syncCountersFromDocument]);

  useEffect(() => {
    if (!hasHydratedPersistenceRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      const savedAt = writeStoredWorkflowDocument(STUDIO_WORKFLOW_AUTOSAVE_KEY, graphState.document);
      if (savedAt) {
        setLastAutosavedAt(savedAt);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [graphState.document]);

  const addNode = useCallback((typeId: string, position: NodeTransform, dataOverrides?: Partial<BaseNodeData>) => {
    const def = globalNodeRegistry.get(typeId);
    if (!def) {
      return null;
    }

    const newNode: StudioNode = {
      id: `${typeId}-${idCounter.current++}`,
      type: typeId,
      position,
      data: createStudioNodeInitialData(def, dataOverrides),
    };

    applyGraphAction({ type: 'add-node', node: newNode });
    return newNode.id;
  }, [applyGraphAction]);

  const updateNodePosition = useCallback((id: string, position: NodeTransform, options?: UpdateNodePositionOptions) => {
    applyGraphAction({ type: 'update-node-position', nodeId: id, position }, {
      trackHistory: options?.trackHistory,
    });
  }, [applyGraphAction]);

  const beginNodePositionSession = useCallback((nodeId: string) => {
    dragHistorySnapshotsRef.current.set(nodeId, cloneWorkflowDocument(graphState.document));
  }, [graphState.document]);

  const commitNodePositionSession = useCallback((nodeId: string) => {
    const snapshot = dragHistorySnapshotsRef.current.get(nodeId);
    dragHistorySnapshotsRef.current.delete(nodeId);

    if (!snapshot) {
      return;
    }

    if (serializeWorkflowDocument(snapshot) === currentSerializedDocument) {
      return;
    }

    pushDocumentIntoHistory(snapshot);
    setFutureDocuments([]);
  }, [currentSerializedDocument, pushDocumentIntoHistory]);

  const updateNodeData = useCallback((id: string, data: Partial<BaseNodeData>) => {
    applyGraphAction({ type: 'update-node-data', nodeId: id, data });
  }, [applyGraphAction]);

  const updateNodePorts = useCallback((id: string, inputs: IPort[], outputs: IPort[]) => {
    applyGraphAction({ type: 'update-node-ports', nodeId: id, inputs, outputs });
  }, [applyGraphAction]);

  const deleteNode = useCallback((id: string) => {
    applyGraphAction({ type: 'delete-node', nodeId: id });
  }, [applyGraphAction]);

  const connectPorts = useCallback((sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => {
    applyGraphAction({
      type: 'connect-ports',
      edge: {
        id: `edge-${edgeCounter.current++}`,
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
      },
    });
  }, [applyGraphAction]);

  const disconnectEdge = useCallback((id: string) => {
    applyGraphAction({ type: 'disconnect-edge', edgeId: id });
  }, [applyGraphAction]);

  const replaceDocument = useCallback((document: WorkflowDocument) => {
    replaceDocumentState(document, { resetHistory: true });
  }, [replaceDocumentState]);

  const undo = useCallback(() => {
    const previous = pastDocuments[pastDocuments.length - 1];
    if (!previous) {
      return;
    }

    setPastDocuments((current) => current.slice(0, -1));
    setFutureDocuments((current) => [cloneWorkflowDocument(graphState.document), ...current]);
    replaceDocumentState(previous, { loadedAt: Date.now() });
  }, [graphState.document, pastDocuments, replaceDocumentState]);

  const redo = useCallback(() => {
    const [next, ...remaining] = futureDocuments;
    if (!next) {
      return;
    }

    setFutureDocuments(remaining);
    pushDocumentIntoHistory(graphState.document);
    replaceDocumentState(next, { loadedAt: Date.now() });
  }, [futureDocuments, graphState.document, pushDocumentIntoHistory, replaceDocumentState]);

  const saveWorkflow = useCallback(() => {
    const savedAt = writeStoredWorkflowDocument(STUDIO_WORKFLOW_MANUAL_SAVE_KEY, graphState.document);
    if (!savedAt) {
      return false;
    }

    setHasSavedWorkflow(true);
    setLastSavedAt(savedAt);
    setSavedDocumentSnapshot(currentSerializedDocument);
    return true;
  }, [currentSerializedDocument, graphState.document]);

  const loadSavedWorkflow = useCallback(() => {
    const record = readStoredWorkflowDocument(STUDIO_WORKFLOW_MANUAL_SAVE_KEY);
    if (!record) {
      return false;
    }

    setHasSavedWorkflow(true);
    setLastSavedAt(record.savedAt);
    setSavedDocumentSnapshot(serializeWorkflowDocument(record.document));
    replaceDocumentState(record.document, {
      resetHistory: true,
      loadedAt: Date.now(),
    });
    return true;
  }, [replaceDocumentState]);

  const clearWorkflow = useCallback(() => {
    replaceDocumentState(createEmptyWorkflowDocument(), { resetHistory: true, loadedAt: Date.now() });
  }, [replaceDocumentState]);

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
    beginNodePositionSession,
    commitNodePositionSession,
    updateNodeData,
    updateNodePorts,
    deleteNode,
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
    updateNodePorts,
    updateNodePosition,
  ]);
}