import {
  NodeExecutionInputMap,
  NodeExecutionSnapshot,
  StudioNodeRuntimeState,
  StudioEdge,
  StudioNode,
  StudioNodeDefinition,
} from './types';
import { createInputExpressionSource } from './expressionUtils';
import { getStudioNodePort, getStudioNodePorts } from './NodeRegistry';
import type { ExpressionSource, NodeExecutionContext, ValidationIssue } from '../../domain/studio/contracts';

const EMPTY_ISSUES: ValidationIssue[] = [];

export type ResolveStaticFieldAddress = (classStableId: string, memberStableId: string) => string | null;

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
  return getStudioNodePort(node, 'input', portId);
}

export function getNodeOutputPort(node: StudioNode | undefined, portId: string) {
  return getStudioNodePort(node, 'output', portId);
}

export function getOutgoingFlowEdges(nodeId: string, nodes: StudioNode[], edges: StudioEdge[]) {
  const node = getStudioNodeById(nodeId, nodes);
  if (!node) {
    return [];
  }

  const flowPortIds = new Set(
    getStudioNodePorts(node, 'output').filter((port) => port.type === 'flow').map((port) => port.id),
  );

  return getOutgoingEdges(nodeId, edges).filter((edge) => edge.channel === 'control' && flowPortIds.has(edge.sourcePortId));
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
    getStudioNodePorts(targetNode, 'input').filter((port) => port.type === 'json').map((port) => port.id),
  );

  return getIncomingEdges(nodeId, edges).reduce<NodeExecutionInputMap>((acc, edge) => {
    if (edge.channel !== 'data') {
      return acc;
    }

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

export function getIncomingControlNodeIds(nodeId: string, edges: StudioEdge[]) {
  return getIncomingEdges(nodeId, edges)
    .filter((edge) => edge.channel === 'control')
    .map((edge) => edge.sourceNodeId);
}

export function getIncomingInputBindings(
  nodeId: string,
  nodes: StudioNode[],
  edges: StudioEdge[],
): NodeExecutionContext['inputBindings'] {
  const targetNode = getStudioNodeById(nodeId, nodes);
  if (!targetNode) {
    return {};
  }

  const jsonInputPortIds = new Set(
    getStudioNodePorts(targetNode, 'input').filter((port) => port.type === 'json').map((port) => port.id),
  );

  return getIncomingEdges(nodeId, edges).reduce<NodeExecutionContext['inputBindings']>((acc, edge) => {
    if (edge.channel !== 'data' || !jsonInputPortIds.has(edge.targetPortId)) {
      return acc;
    }

    if (!acc[edge.targetPortId]) {
      acc[edge.targetPortId] = [];
    }

    acc[edge.targetPortId].push(
      createInputExpressionSource(
        edge.sourceNodeId,
        edge.sourcePortId,
        [],
        `${edge.sourceNodeId}.${edge.sourcePortId}`,
      ),
    );

    return acc;
  }, {});
}

function getNodeRuntimeState(node: StudioNode, definition?: StudioNodeDefinition): StudioNodeRuntimeState {
  return definition?.createRuntimeState?.(node) ?? {
    parameters: {},
    bindings: {},
    documentState: {},
  };
}

function getValueAtPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

function resolveLiteralValue(source: Extract<ExpressionSource, { kind: 'literal' }>) {
  if (source.valueType === 'number') {
    const parsed = Number(source.raw);
    return Number.isNaN(parsed) ? source.raw : parsed;
  }

  if (source.valueType === 'boolean') {
    if (source.raw === 'true') {
      return true;
    }

    if (source.raw === 'false') {
      return false;
    }
  }

  if (source.valueType === 'json') {
    try {
      return JSON.parse(source.raw);
    } catch {
      return source.raw;
    }
  }

  return source.raw;
}

export function resolveExpressionSource(
  source: ExpressionSource,
  snapshots: Record<string, NodeExecutionSnapshot>,
  resolveStaticFieldAddress?: ResolveStaticFieldAddress,
) {
  if (source.kind === 'literal') {
    return resolveLiteralValue(source);
  }

  if (source.kind === 'input-expression') {
    const sourceNodeId = source.sourceNodeId;
    if (!sourceNodeId) {
      return undefined;
    }

    const payload = snapshots[sourceNodeId]?.outputs[source.bindingSlot]?.payload;
    if (payload === undefined) {
      return undefined;
    }

    return getValueAtPath(payload, source.sourcePath);
  }

  return resolveStaticFieldAddress?.(source.classStableId, source.memberStableId) ?? null;
}

function resolveBindingValue(
  binding: ExpressionSource | ExpressionSource[],
  snapshots: Record<string, NodeExecutionSnapshot>,
  resolveStaticFieldAddress?: ResolveStaticFieldAddress,
) {
  if (Array.isArray(binding)) {
    return binding.map((entry) => resolveExpressionSource(entry, snapshots, resolveStaticFieldAddress));
  }

  return resolveExpressionSource(binding, snapshots, resolveStaticFieldAddress);
}

export function createNodeExecutionContext(
  documentId: string,
  nodeId: string,
  nodes: StudioNode[],
  edges: StudioEdge[],
  snapshots: Record<string, NodeExecutionSnapshot>,
  definition?: StudioNodeDefinition,
  resolveStaticFieldAddress?: ResolveStaticFieldAddress,
): NodeExecutionContext | null {
  const node = getStudioNodeById(nodeId, nodes);
  if (!node) {
    return null;
  }

  const runtimeState = getNodeRuntimeState(node, definition);
  const incoming = getIncomingJsonInputs(nodeId, nodes, edges, snapshots);

  return {
    documentId,
    nodeId,
    nodeType: node.type,
    parameters: runtimeState.parameters,
    bindings: runtimeState.bindings,
    resolvedBindings: Object.fromEntries(
      Object.entries(runtimeState.bindings).map(([key, value]) => [key, resolveBindingValue(value, snapshots, resolveStaticFieldAddress)]),
    ),
    documentState: runtimeState.documentState,
    inputBindings: getIncomingInputBindings(nodeId, nodes, edges),
    resolvedInputs: Object.fromEntries(
      Object.entries(incoming).map(([key, envelopes]) => [key, envelopes.map((envelope) => envelope.payload)]),
    ),
    controlInputs: getIncomingControlNodeIds(nodeId, edges),
  };
}

export function validateNodeExecution(
  context: NodeExecutionContext,
  definition?: StudioNodeDefinition,
): ValidationIssue[] {
  if (!definition?.executionContract) {
    return EMPTY_ISSUES;
  }

  return definition.executionContract.validate(context);
}
