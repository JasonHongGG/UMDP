import {
  NodeExecutionContext,
  NodeExecutionInputMap,
  NodeExecutionSnapshot,
  NodeValidationResult,
  StudioEdge,
  StudioNode,
  StudioNodeDefinition,
} from './types';

const VALID_NODE_EXECUTION: NodeValidationResult = { valid: true };

export function getStudioNodeById(nodeId: string, nodes: StudioNode[]) {
  return nodes.find((node) => node.id === nodeId);
}

export function getIncomingEdges(nodeId: string, edges: StudioEdge[]) {
  return edges.filter((edge) => edge.targetNodeId === nodeId);
}

export function getOutgoingEdges(nodeId: string, edges: StudioEdge[]) {
  return edges.filter((edge) => edge.sourceNodeId === nodeId);
}

export function getNodeInputPort(node: StudioNode | undefined, portId: string) {
  return node?.data.inputs.find((port) => port.id === portId);
}

export function getNodeOutputPort(node: StudioNode | undefined, portId: string) {
  return node?.data.outputs.find((port) => port.id === portId);
}

export function getOutgoingFlowEdges(nodeId: string, nodes: StudioNode[], edges: StudioEdge[]) {
  const node = getStudioNodeById(nodeId, nodes);
  if (!node) {
    return [];
  }

  const flowPortIds = new Set(
    node.data.outputs.filter((port) => port.type === 'flow').map((port) => port.id),
  );

  return getOutgoingEdges(nodeId, edges).filter((edge) => flowPortIds.has(edge.sourcePortId));
}

export function getIncomingJsonInputs(
  nodeId: string,
  nodes: StudioNode[],
  edges: StudioEdge[],
  snapshots: Record<string, NodeExecutionSnapshot>,
): NodeExecutionInputMap {
  const targetNode = getStudioNodeById(nodeId, nodes);
  if (!targetNode) {
    return {};
  }

  const jsonInputPortIds = new Set(
    targetNode.data.inputs.filter((port) => port.type === 'json').map((port) => port.id),
  );

  return getIncomingEdges(nodeId, edges).reduce<NodeExecutionInputMap>((acc, edge) => {
    if (!jsonInputPortIds.has(edge.targetPortId)) {
      return acc;
    }

    const sourceNode = getStudioNodeById(edge.sourceNodeId, nodes);
    const sourcePort = getNodeOutputPort(sourceNode, edge.sourcePortId);
    if (sourcePort?.type !== 'json') {
      return acc;
    }

    const envelope = snapshots[edge.sourceNodeId]?.outputs[edge.sourcePortId];
    if (!envelope) {
      return acc;
    }

    if (!acc[edge.targetPortId]) {
      acc[edge.targetPortId] = [];
    }

    acc[edge.targetPortId].push(envelope);
    return acc;
  }, {});
}

export function createNodeExecutionContext(
  nodeId: string,
  nodes: StudioNode[],
  edges: StudioEdge[],
  snapshots: Record<string, NodeExecutionSnapshot>,
): NodeExecutionContext | null {
  const node = getStudioNodeById(nodeId, nodes);
  if (!node) {
    return null;
  }

  return {
    node,
    nodes,
    edges,
    incoming: getIncomingJsonInputs(nodeId, nodes, edges, snapshots),
  };
}

export function validateNodeExecution(
  context: NodeExecutionContext,
  definition?: StudioNodeDefinition,
): NodeValidationResult {
  if (!definition?.validateExecution) {
    return VALID_NODE_EXECUTION;
  }

  return definition.validateExecution(context);
}
