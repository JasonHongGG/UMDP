import { getNodePortsByDirection, globalNodeRegistry } from './NodeRegistry';
import { materializeNodeQuerySnapshot } from './graphInterpreter';
import type { IPort, StudioEdge, StudioNode } from './types';
import type { NodeQueryIssue } from '../../domain/studio/contracts';
import { getClassInfoPayloadFromValue } from '../../nodes/CallFunctionNode/callFunctionNodeModel';
import type { StudioNodeQueryContext } from './queryTypes';

export type { StudioNodeQueryContext } from './queryTypes';

export interface InputPortBindingSource {
  edge: StudioEdge;
  sourceNode: StudioNode | null;
  sourcePort: IPort | null;
  payload: unknown;
}

export interface InputPortBindingState {
  port: IPort;
  sources: InputPortBindingSource[];
  issues: NodeQueryIssue[];
}

function getNodeById(nodeId: string, nodes: StudioNode[]) {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function getIncomingEdges(nodeId: string, edges: StudioEdge[]) {
  return edges.filter((edge) => edge.targetNodeId === nodeId);
}

export function getNodeQuerySnapshot(nodeId: string, context: StudioNodeQueryContext) {
  return materializeNodeQuerySnapshot(nodeId, context, new Set<string>());
}

export function getNodeQueryState<T>(nodeId: string, context: StudioNodeQueryContext): T | null {
  const node = getNodeById(nodeId, context.nodes);
  const nodeDef = node ? globalNodeRegistry.get(node.type) : null;
  if (!node || !nodeDef?.buildQueryState) {
    return null;
  }

  return (nodeDef.buildQueryState(node as never, context) as T | null) ?? null;
}

export function getNodeOutputPreview(nodeId: string, context: StudioNodeQueryContext) {
  return getNodeQuerySnapshot(nodeId, context)?.outputs ?? null;
}

function getInputPortIssues(port: IPort, sources: InputPortBindingSource[]): NodeQueryIssue[] {
  if (sources.length === 0) {
    return [{
      severity: port.required ? 'warning' : 'info',
      code: 'query.input.unbound',
      message: `No source is bound to ${port.label}.`,
      targetPortId: port.id,
    }];
  }

  if (port.channel !== 'data') {
    return [];
  }

  const missingPayload = sources.filter((source) => source.payload === null || source.payload === undefined);
  if (missingPayload.length > 0) {
    return [{
      severity: 'warning',
      code: 'query.input.payload-missing',
      message: `${port.label} is connected but the upstream payload is not available yet.`,
      targetPortId: port.id,
    }];
  }

  return [];
}

export function getNodeInputBindingStates(nodeId: string, context: StudioNodeQueryContext): InputPortBindingState[] {
  const node = getNodeById(nodeId, context.nodes);
  const nodeDef = node ? globalNodeRegistry.get(node.type) : null;
  if (!node || !nodeDef) {
    return [];
  }

  const inputPorts = getNodePortsByDirection(nodeDef, 'input');

  return inputPorts.map((port) => {
    const boundEdges = context.edges.filter(
      (edge) => edge.targetNodeId === nodeId && edge.targetPortId === port.id && edge.channel === port.channel,
    );
    const sources = boundEdges.map<InputPortBindingSource>((edge) => {
      const sourceNode = getNodeById(edge.sourceNodeId, context.nodes);
      const sourceNodeDef = sourceNode ? globalNodeRegistry.get(sourceNode.type) : null;
      const sourcePort = sourceNodeDef ? getNodePortsByDirection(sourceNodeDef, 'output').find((candidate) => candidate.id === edge.sourcePortId) ?? null : null;

      return {
        edge,
        sourceNode,
        sourcePort,
        payload: getNodeQuerySnapshot(edge.sourceNodeId, context)?.outputs[edge.sourcePortId]?.payload ?? null,
      };
    });

    return {
      port,
      sources,
      issues: getInputPortIssues(port, sources),
    };
  });
}

export function getConnectedInputPayload(nodeId: string, targetPortId: string, context: StudioNodeQueryContext): unknown {
  const incomingEdge = context.edges.find((edge) => edge.targetNodeId === nodeId && edge.targetPortId === targetPortId && edge.channel === 'data');
  if (!incomingEdge) {
    return null;
  }

  return getNodeQuerySnapshot(incomingEdge.sourceNodeId, context)?.outputs[incomingEdge.sourcePortId]?.payload ?? null;
}

export function getConnectedClassInfoPayload(nodeId: string, context: StudioNodeQueryContext) {
  return getClassInfoPayloadFromValue(getConnectedInputPayload(nodeId, 'class-info-in', context));
}