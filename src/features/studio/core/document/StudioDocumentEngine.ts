import type { GraphDocument, NodeInstance } from '@/domain/studio/contracts';
import type { StudioNodeCatalog } from '../catalog/StudioNodeCatalog';
import { createStudioNodeInitialData, dehydrateStudioNodeData, getStudioNodePort, hydrateStudioNodeData } from '../NodeRegistry';
import { cloneGraphDocument, createEmptyGraphDocument, serializeGraphDocument } from '@/infrastructure/studio/persistence/graphPersistence';
import type { BaseNodeData, NodeTransform, StudioEdge, StudioNode, StudioNodeDefinition } from '../types';

export interface DuplicateNodesOptions {
  offset?: { x: number; y: number };
}

export const MAX_STUDIO_GRAPH_HISTORY_ENTRIES = 100;
export const EMPTY_WORKFLOW_SNAPSHOT = serializeGraphDocument(createEmptyGraphDocument());

export function deriveStudioGraphCounters(document: GraphDocument) {
  const nextNodeCounter = document.nodes.reduce((highest, node) => {
    const match = node.id.match(/-(\d+)$/);
    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]) + 1);
  }, 1);

  const nextEdgeCounter = [...document.controlConnections, ...document.dataConnections].reduce((highest, edge) => {
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

export function isStudioGraphDocumentDirty(document: GraphDocument, savedDocumentSnapshot: string | null) {
  const currentSerializedDocument = serializeGraphDocument(document);
  if (savedDocumentSnapshot === null) {
    return currentSerializedDocument !== EMPTY_WORKFLOW_SNAPSHOT;
  }

  return currentSerializedDocument !== savedDocumentSnapshot;
}

export function pushStudioGraphHistoryEntry(history: GraphDocument[], document: GraphDocument, limit = MAX_STUDIO_GRAPH_HISTORY_ENTRIES) {
  const next = [...history, cloneGraphDocument(document)];
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }

  return next;
}

export function duplicateStudioGraphSelection(
  document: GraphDocument,
  selectedNodeIds: string[],
  getNextNodeId: (nodeType: string) => string,
  getNextEdgeId: () => string,
  options?: DuplicateNodesOptions,
) {
  const selectedSet = new Set(selectedNodeIds);
  const selectedNodes = document.nodes.filter((node) => selectedSet.has(node.id));

  if (selectedNodes.length === 0) {
    return {
      document,
      duplicatedNodeIds: [] as string[],
    };
  }

  const offset = options?.offset ?? { x: 40, y: 40 };
  const idMap = new Map<string, string>();
  const duplicatedNodes = selectedNodes.map((node) => {
    const duplicatedNode = JSON.parse(JSON.stringify(node)) as NodeInstance;
    duplicatedNode.id = getNextNodeId(node.nodeType);
    duplicatedNode.position = {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y,
    };
    idMap.set(node.id, duplicatedNode.id);
    return duplicatedNode;
  });

  const duplicateControlConnection = (connection: GraphDocument['controlConnections'][number]) => ({
    ...JSON.parse(JSON.stringify(connection)),
    id: getNextEdgeId(),
    source: {
      ...connection.source,
      nodeId: idMap.get(connection.source.nodeId) ?? connection.source.nodeId,
    },
    target: {
      ...connection.target,
      nodeId: idMap.get(connection.target.nodeId) ?? connection.target.nodeId,
    },
  });
  const duplicateDataConnection = (connection: GraphDocument['dataConnections'][number]) => ({
    ...JSON.parse(JSON.stringify(connection)),
    id: getNextEdgeId(),
    source: {
      ...connection.source,
      nodeId: idMap.get(connection.source.nodeId) ?? connection.source.nodeId,
    },
    target: {
      ...connection.target,
      nodeId: idMap.get(connection.target.nodeId) ?? connection.target.nodeId,
    },
  });

  const duplicatedControlConnections = document.controlConnections
    .filter((connection) => selectedSet.has(connection.source.nodeId) && selectedSet.has(connection.target.nodeId))
    .map(duplicateControlConnection);
  const duplicatedDataConnections = document.dataConnections
    .filter((connection) => selectedSet.has(connection.source.nodeId) && selectedSet.has(connection.target.nodeId))
    .map(duplicateDataConnection);

  return {
    document: {
      ...document,
      nodes: [...document.nodes, ...duplicatedNodes],
      controlConnections: [...document.controlConnections, ...duplicatedControlConnections],
      dataConnections: [...document.dataConnections, ...duplicatedDataConnections],
    },
    duplicatedNodeIds: duplicatedNodes.map((node) => node.id),
  };
}

export function connectionKeyToEdge(channel: StudioEdge['channel'], connection: GraphDocument['controlConnections'][number] | GraphDocument['dataConnections'][number]): StudioEdge {
  return {
    id: connection.id,
    channel,
    sourceNodeId: connection.source.nodeId,
    sourcePortId: connection.source.connectionKey,
    targetNodeId: connection.target.nodeId,
    targetPortId: connection.target.connectionKey,
  };
}

export function instanceToCanvasNode(instance: NodeInstance, catalog: StudioNodeCatalog): StudioNode | null {
  const def = catalog.get(instance.nodeType);
  if (!def) {
    return null;
  }

  return {
    id: instance.id,
    type: instance.nodeType,
    position: instance.position,
    data: hydrateStudioNodeData(def, instance),
  };
}

export function buildNodeInstance(def: StudioNodeDefinition, id: string, position: NodeTransform, data: BaseNodeData): NodeInstance {
  const baseInstance: NodeInstance = {
    id,
    nodeType: def.manifest.type,
    typeVersion: def.manifest.typeVersion,
    position,
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: {},
  };
  const runtimeState = dehydrateStudioNodeData(def, data, baseInstance);

  return {
    ...baseInstance,
    displayName: runtimeState.displayName,
    parameters: runtimeState.parameters,
    bindings: runtimeState.bindings,
    documentState: runtimeState.documentState,
  };
}

export function resolveSourcePort(nodes: StudioNode[], catalog: StudioNodeCatalog, sourceNodeId: string, sourcePortId: string) {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    return undefined;
  }

  return getStudioNodePort(sourceNode, 'output', sourcePortId, catalog);
}
