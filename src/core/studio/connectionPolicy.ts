import { PortHandleType, PortType, StudioEdge, StudioNode } from './types';

export interface ConnectionEndpoint {
  nodeId: string;
  portId: string;
  portType: PortType;
  handleType: PortHandleType;
}

export interface ConnectionValidationResult {
  valid: boolean;
  replaceEdgeIds: string[];
  reason?: string;
}

const EMPTY_CONNECTION_VALIDATION: ConnectionValidationResult = {
  valid: false,
  replaceEdgeIds: [],
};

function getNodeById(nodeId: string, nodes: StudioNode[]) {
  return nodes.find((node) => node.id === nodeId);
}

function hasMatchingPort(node: StudioNode | undefined, portId: string, handleType: PortHandleType, portType: PortType) {
  const ports = handleType === 'source' ? node?.data.outputs : node?.data.inputs;
  const port = ports?.find((item) => item.id === portId);
  return port?.type === portType;
}

export function arePortTypesCompatible(source: PortType, target: PortType) {
  return source === target;
}

export function validateConnection(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  nodes: StudioNode[],
  edges: StudioEdge[],
): ConnectionValidationResult {
  if (source.handleType !== 'source') {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connections must start from an output port.' };
  }

  if (target.handleType !== 'target') {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connections must terminate at an input port.' };
  }

  if (source.nodeId === target.nodeId) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Self connections are not supported.' };
  }

  if (!arePortTypesCompatible(source.portType, target.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Port types are incompatible.' };
  }

  const sourceNode = getNodeById(source.nodeId, nodes);
  const targetNode = getNodeById(target.nodeId, nodes);
  if (!sourceNode || !targetNode) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection endpoint not found.' };
  }

  if (!hasMatchingPort(sourceNode, source.portId, source.handleType, source.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Source output port is missing or mismatched.' };
  }

  if (!hasMatchingPort(targetNode, target.portId, target.handleType, target.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Target input port is missing or mismatched.' };
  }

  const duplicateEdge = edges.find(
    (edge) =>
      edge.sourceNodeId === source.nodeId &&
      edge.sourcePortId === source.portId &&
      edge.targetNodeId === target.nodeId &&
      edge.targetPortId === target.portId,
  );
  if (duplicateEdge) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection already exists.' };
  }

  const replaceEdgeIds = edges
    .filter((edge) => edge.targetNodeId === target.nodeId && edge.targetPortId === target.portId)
    .map((edge) => edge.id);

  return {
    valid: true,
    replaceEdgeIds,
  };
}
