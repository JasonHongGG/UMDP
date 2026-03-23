import { WORKFLOW_SCHEMA_IDS } from '../../domain/studio/contracts';
import { getStudioNodePort } from './NodeRegistry';
import { getConnectionChannelForPortType, IPort, PortHandleType, PortType, StudioEdge, StudioNode } from './types';

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
  const port = getStudioNodePort(node, handleType === 'source' ? 'output' : 'input', portId);
  return port?.type === portType;
}

export function arePortTypesCompatible(source: PortType, target: PortType) {
  return source === target;
}

export function arePortDataTypesCompatible(source: IPort, target: IPort) {
  if (source.type !== 'json' || target.type !== 'json') {
    return true;
  }

  const sourceDataType = source.dataType ?? source.schema?.id;
  const targetDataType = target.dataType ?? target.schema?.id;

  if (!sourceDataType || !targetDataType) {
    return true;
  }

  if (sourceDataType === WORKFLOW_SCHEMA_IDS.genericJson || targetDataType === WORKFLOW_SCHEMA_IDS.genericJson) {
    return true;
  }

  if (
    sourceDataType === WORKFLOW_SCHEMA_IDS.classInfo
    && targetDataType === WORKFLOW_SCHEMA_IDS.instanceReference
  ) {
    return true;
  }

  return sourceDataType === targetDataType;
}

export function arePortsCompatible(source: IPort, target: IPort) {
  return arePortTypesCompatible(source.type, target.type)
    && source.channel === target.channel
    && arePortDataTypesCompatible(source, target);
}

function collectReplacementEdgeIds(edges: StudioEdge[], sourcePort: IPort, targetPort: IPort, source: ConnectionEndpoint, target: ConnectionEndpoint) {
  const replacements = new Set<string>();

  if (targetPort.cardinality === 'single') {
    edges
      .filter((edge) => edge.channel === targetPort.channel && edge.targetNodeId === target.nodeId && edge.targetPortId === target.portId)
      .forEach((edge) => replacements.add(edge.id));
  }

  if (sourcePort.cardinality === 'single') {
    edges
      .filter((edge) => edge.channel === sourcePort.channel && edge.sourceNodeId === source.nodeId && edge.sourcePortId === source.portId)
      .forEach((edge) => replacements.add(edge.id));
  }

  return [...replacements];
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

  const channel = getConnectionChannelForPortType(source.portType);
  if (channel !== getConnectionChannelForPortType(target.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection channels are incompatible.' };
  }

  const sourceNode = getNodeById(source.nodeId, nodes);
  const targetNode = getNodeById(target.nodeId, nodes);
  if (!sourceNode || !targetNode) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection endpoint not found.' };
  }

  const sourcePort = getStudioNodePort(sourceNode, 'output', source.portId);
  const targetPort = getStudioNodePort(targetNode, 'input', target.portId);

  if (!hasMatchingPort(sourceNode, source.portId, source.handleType, source.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Source output port is missing or mismatched.' };
  }

  if (!hasMatchingPort(targetNode, target.portId, target.handleType, target.portType)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Target input port is missing or mismatched.' };
  }

  if (!sourcePort || !targetPort) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection endpoint not found.' };
  }

  if (!arePortsCompatible(sourcePort, targetPort)) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Port schemas or connection semantics are incompatible.' };
  }

  const duplicateEdge = edges.find(
    (edge) =>
      edge.channel === channel &&
      edge.sourceNodeId === source.nodeId &&
      edge.sourcePortId === source.portId &&
      edge.targetNodeId === target.nodeId &&
      edge.targetPortId === target.portId,
  );
  if (duplicateEdge) {
    return { ...EMPTY_CONNECTION_VALIDATION, reason: 'Connection already exists.' };
  }

  const replaceEdgeIds = collectReplacementEdgeIds(edges, sourcePort, targetPort, source, target);

  return {
    valid: true,
    replaceEdgeIds,
  };
}
