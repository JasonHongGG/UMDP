import { BaseNodeData, IPort, StudioEdge, StudioNode, WorkflowDocument } from './types';
import { createEmptyWorkflowDocument } from './persistence';

export interface StudioGraphState {
  document: WorkflowDocument;
}

export type StudioGraphAction =
  | { type: 'add-node'; node: StudioNode }
  | { type: 'update-node-position'; nodeId: string; position: StudioNode['position'] }
  | { type: 'update-node-data'; nodeId: string; data: Partial<BaseNodeData> }
  | { type: 'update-node-ports'; nodeId: string; inputs: IPort[]; outputs: IPort[] }
  | { type: 'delete-node'; nodeId: string }
  | { type: 'connect-ports'; edge: StudioEdge }
  | { type: 'disconnect-edge'; edgeId: string }
  | { type: 'add-edge'; edge: StudioEdge }
  | { type: 'delete-edge'; edgeId: string }
  | { type: 'replace-document'; document: WorkflowDocument };

export const initialStudioGraphState: StudioGraphState = {
  document: createEmptyWorkflowDocument(),
};

export function reduceStudioGraphDocument(document: WorkflowDocument, action: StudioGraphAction): WorkflowDocument {
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
    case 'update-node-data':
      return {
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === action.nodeId ? { ...node, data: { ...node.data, ...action.data } } : node,
        ),
      };
    case 'update-node-ports':
      return {
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === action.nodeId
            ? { ...node, data: { ...node.data, inputs: action.inputs, outputs: action.outputs } }
            : node,
        ),
        edges: document.edges.filter((edge) => {
          if (edge.sourceNodeId === action.nodeId && !action.outputs.find((port) => port.id === edge.sourcePortId)) {
            return false;
          }

          if (edge.targetNodeId === action.nodeId && !action.inputs.find((port) => port.id === edge.targetPortId)) {
            return false;
          }

          return true;
        }),
      };
    case 'delete-node':
      return {
        ...document,
        nodes: document.nodes.filter((node) => node.id !== action.nodeId),
        edges: document.edges.filter(
          (edge) => edge.sourceNodeId !== action.nodeId && edge.targetNodeId !== action.nodeId,
        ),
      };
    case 'connect-ports':
    case 'add-edge': {
      const exists = document.edges.some(
        (edge) =>
          edge.sourceNodeId === action.edge.sourceNodeId &&
          edge.sourcePortId === action.edge.sourcePortId &&
          edge.targetNodeId === action.edge.targetNodeId &&
          edge.targetPortId === action.edge.targetPortId,
      );

      if (exists) {
        return document;
      }

      const remainingEdges = document.edges.filter(
        (edge) => !(edge.targetNodeId === action.edge.targetNodeId && edge.targetPortId === action.edge.targetPortId),
      );

      return {
        ...document,
        edges: [...remainingEdges, action.edge],
      };
    }
    case 'disconnect-edge':
    case 'delete-edge':
      return {
        ...document,
        edges: document.edges.filter((edge) => edge.id !== action.edgeId),
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