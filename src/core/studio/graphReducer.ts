import type { ConnectionChannel, GraphDocument, NodeInstance } from '../../domain/studio/contracts';
import { StudioEdge } from './types';
import { createEmptyGraphDocument } from './persistence';

export interface StudioGraphState {
  document: GraphDocument;
}

export type StudioGraphAction =
  | { type: 'add-node'; node: NodeInstance }
  | { type: 'update-node-position'; nodeId: string; position: NodeInstance['position'] }
  | { type: 'update-node-positions'; updates: Array<{ nodeId: string; position: NodeInstance['position'] }> }
  | { type: 'update-node-instance'; nodeId: string; node: NodeInstance }
  | { type: 'delete-node'; nodeId: string }
  | { type: 'delete-nodes'; nodeIds: string[] }
  | { type: 'connect-ports'; edge: StudioEdge; replaceEdgeIds?: string[] }
  | { type: 'disconnect-edge'; edgeId: string }
  | { type: 'add-edge'; edge: StudioEdge; replaceEdgeIds?: string[] }
  | { type: 'delete-edge'; edgeId: string }
  | { type: 'replace-document'; document: GraphDocument };

export const initialStudioGraphState: StudioGraphState = {
  document: createEmptyGraphDocument(),
};

function selectConnections(document: GraphDocument, channel: ConnectionChannel) {
  return channel === 'control' ? document.controlConnections : document.dataConnections;
}

function replaceConnections(
  document: GraphDocument,
  channel: 'control',
  connections: GraphDocument['controlConnections'],
): GraphDocument;
function replaceConnections(
  document: GraphDocument,
  channel: 'data',
  connections: GraphDocument['dataConnections'],
): GraphDocument;
function replaceConnections(
  document: GraphDocument,
  channel: ConnectionChannel,
  connections: GraphDocument['controlConnections'] | GraphDocument['dataConnections'],
): GraphDocument {
  if (channel === 'control') {
    return { ...document, controlConnections: connections as GraphDocument['controlConnections'] };
  }

  return { ...document, dataConnections: connections as GraphDocument['dataConnections'] };
}

function edgeToConnection(edge: StudioEdge) {
  if (edge.channel === 'control') {
    return {
      id: edge.id,
      source: { nodeId: edge.sourceNodeId, connectionKey: edge.sourcePortId },
      target: { nodeId: edge.targetNodeId, connectionKey: edge.targetPortId },
    };
  }

  return {
    id: edge.id,
    source: { nodeId: edge.sourceNodeId, connectionKey: edge.sourcePortId },
    target: { nodeId: edge.targetNodeId, connectionKey: edge.targetPortId },
    bindingKey: edge.targetPortId,
  };
}

export function reduceStudioGraphDocument(document: GraphDocument, action: StudioGraphAction): GraphDocument {
  switch (action.type) {
    case 'add-node':
      return {
        ...document,
        nodes: [...document.nodes, action.node],
      };
    case 'update-node-position':
      return {
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === action.nodeId ? { ...node, position: action.position } : node,
        ),
      };
    case 'update-node-positions': {
      const updatesByNodeId = new Map(action.updates.map((entry) => [entry.nodeId, entry.position]));

      return {
        ...document,
        nodes: document.nodes.map((node) => {
          const nextPosition = updatesByNodeId.get(node.id);
          return nextPosition ? { ...node, position: nextPosition } : node;
        }),
      };
    }
    case 'update-node-instance':
      return {
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === action.nodeId ? action.node : node,
        ),
      };
    case 'delete-node':
    case 'delete-nodes': {
      const nodeIds = new Set(action.type === 'delete-node' ? [action.nodeId] : action.nodeIds);

      return {
        ...document,
        nodes: document.nodes.filter((node) => !nodeIds.has(node.id)),
        controlConnections: document.controlConnections.filter(
          (edge) => !nodeIds.has(edge.source.nodeId) && !nodeIds.has(edge.target.nodeId),
        ),
        dataConnections: document.dataConnections.filter(
          (edge) => !nodeIds.has(edge.source.nodeId) && !nodeIds.has(edge.target.nodeId),
        ),
      };
    }
    case 'connect-ports':
    case 'add-edge': {
      const currentConnections = selectConnections(document, action.edge.channel);
      const exists = currentConnections.some(
        (edge) =>
          edge.source.nodeId === action.edge.sourceNodeId &&
          edge.source.connectionKey === action.edge.sourcePortId &&
          edge.target.nodeId === action.edge.targetNodeId &&
          edge.target.connectionKey === action.edge.targetPortId,
      );

      if (exists) {
        return document;
      }

      const replaceEdgeIds = new Set(action.replaceEdgeIds ?? []);
      const remainingEdges = currentConnections.filter((edge) => !replaceEdgeIds.has(edge.id));

      if (action.edge.channel === 'control') {
        return replaceConnections(document, 'control', [...remainingEdges, edgeToConnection(action.edge)] as GraphDocument['controlConnections']);
      }

      return replaceConnections(document, 'data', [...remainingEdges, edgeToConnection(action.edge)] as GraphDocument['dataConnections']);
    }
    case 'disconnect-edge':
    case 'delete-edge':
      return {
        ...document,
        controlConnections: document.controlConnections.filter((edge) => edge.id !== action.edgeId),
        dataConnections: document.dataConnections.filter((edge) => edge.id !== action.edgeId),
      };
    case 'replace-document':
      return action.document;
    default:
      return document;
  }
}

export function studioGraphReducer(state: StudioGraphState, action: StudioGraphAction): StudioGraphState {
  const nextDocument = reduceStudioGraphDocument(state.document, action);
  if (nextDocument === state.document) {
    return state;
  }

  return {
    ...state,
    document: nextDocument,
  };
}