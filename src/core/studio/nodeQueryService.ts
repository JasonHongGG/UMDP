import { createCallFunctionResultEnvelope, createClassInfoEnvelope } from './contracts';
import { getNodePortsByDirection, globalNodeRegistry } from './NodeRegistry';
import type { StudioRuntimeDataState } from './runtimeData';
import type { BaseNodeData, IPort, NodeExecutionOutputMap, NodeExecutionSnapshot, StudioEdge, StudioNode } from './types';
import type { ClassInfoPayload, ExpressionSource, WorkflowJsonValue } from '../../domain/studio/contracts';
import { reconcileClassInfoSelection, type ClassBinding, type ClassInfoCatalog, type ClassInfoSelection } from '../../domain/studio/editor';
import { createEmptyCatalog } from '../../nodes/ClassNode/classNodeModel';
import { findSelectedFunction, getClassInfoPayloadFromValue, type CallFunctionNodeData } from '../../nodes/CallFunctionNode/callFunctionNodeModel';

interface ClassNodePreviewState {
  binding: ClassBinding | null;
  availableInfo: ClassInfoCatalog;
  selection: ClassInfoSelection;
  resolvedInstanceAddress: WorkflowJsonValue | undefined | null;
}

export interface StudioNodeQueryContext {
  nodes: StudioNode[];
  edges: StudioEdge[];
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  runtimeData: StudioRuntimeDataState;
}

export interface NodeQueryIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  targetPortId?: string;
}

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

export interface CallFunctionClassInfoQueryState {
  payload: ClassInfoPayload | null;
  methods: NonNullable<ClassInfoPayload>['functions'];
  issues: NodeQueryIssue[];
}

function getNodeById(nodeId: string, nodes: StudioNode[]) {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function getIncomingEdges(nodeId: string, edges: StudioEdge[]) {
  return edges.filter((edge) => edge.targetNodeId === nodeId);
}

function createClassNodePreviewState(
  nodeData: BaseNodeData,
  runtimeData: StudioRuntimeDataState,
  snapshots: Record<string, NodeExecutionSnapshot>,
): ClassNodePreviewState {
  const classData = nodeData as BaseNodeData & {
    binding?: ClassBinding | null;
    instanceSource?: ExpressionSource | null;
    infoSelection?: ClassInfoSelection;
  };

  const availableInfo = runtimeData.getClassInfoCatalogByBinding(classData.binding) ?? createEmptyCatalog();
  const infoSelection = classData.infoSelection ?? { members: [], statics: [], functions: [] };
  const resolvedInstanceAddress = classData.instanceSource
    ? runtimeData.resolveExpressionSource(classData.instanceSource, snapshots)
    : null;

  return {
    binding: classData.binding ?? null,
    availableInfo,
    selection: reconcileClassInfoSelection(infoSelection, availableInfo),
    resolvedInstanceAddress,
  };
}

function buildPreviewSnapshot(
  nodeId: string,
  context: StudioNodeQueryContext,
  resolving: Set<string>,
): NodeExecutionSnapshot | null {
  const runtimeSnapshot = context.nodeSnapshots[nodeId];
  if (runtimeSnapshot) {
    return runtimeSnapshot;
  }

  if (resolving.has(nodeId)) {
    return null;
  }

  const node = getNodeById(nodeId, context.nodes);
  if (!node) {
    return null;
  }

  resolving.add(nodeId);

  const dependencySnapshots = getIncomingEdges(nodeId, context.edges).reduce<Record<string, NodeExecutionSnapshot>>((acc, edge) => {
    const dependencySnapshot = buildPreviewSnapshot(edge.sourceNodeId, context, resolving);
    if (dependencySnapshot) {
      acc[dependencySnapshot.nodeId] = dependencySnapshot;
    }
    return acc;
  }, {});

  const snapshots = {
    ...context.nodeSnapshots,
    ...dependencySnapshots,
  };

  const nodeDef = globalNodeRegistry.get(node.type);
  let outputs: NodeExecutionOutputMap | undefined;

  if (node.type === 'class-ref') {
    const previewState = createClassNodePreviewState(node.data, context.runtimeData, snapshots);
    const resolvedMemberValues = previewState.binding
      ? context.runtimeData.resolveClassMemberValues(previewState.binding.classStableId, previewState.resolvedInstanceAddress ?? null)
      : undefined;

    outputs = {
      'info-out': createClassInfoEnvelope(
        previewState.binding,
        previewState.availableInfo,
        previewState.selection,
        previewState.resolvedInstanceAddress ?? null,
        resolvedMemberValues,
      ),
    };
  } else if (node.type === 'call-function') {
    const incomingEdge = context.edges.find((edge) => edge.targetNodeId === node.id && edge.targetPortId === 'class-info-in' && edge.channel === 'data');
    const classInfoPayload = incomingEdge
      ? getClassInfoPayloadFromValue(snapshots[incomingEdge.sourceNodeId]?.outputs[incomingEdge.sourcePortId]?.payload)
      : null;

    if (classInfoPayload) {
      const callFunctionData = node.data as CallFunctionNodeData;
      const method = findSelectedFunction(classInfoPayload, callFunctionData.selectedMethodStableId);
      if (method) {
        outputs = {
          'result-out': createCallFunctionResultEnvelope({
            method,
            instanceAddress: classInfoPayload.instanceAddress,
            arguments: callFunctionData.arguments.map((entry) => ({
              name: entry.name,
              typeName: method.parameters.find((parameter) => parameter.name === entry.name)?.typeName ?? 'System.Object',
              value: context.runtimeData.resolveExpressionSource(entry.source, snapshots) ?? null,
            })),
            success: false,
            failureKind: 'none',
            error: null,
            exception: null,
            result: null,
          }),
        };
      }
    }
  }

  if (!outputs) {
    outputs = nodeDef?.getExecutionPreview?.(node.data);
  }

  resolving.delete(nodeId);

  if (!outputs) {
    return null;
  }

  return {
    nodeId: node.id,
    status: 'success',
    source: 'materialized',
    inputs: {},
    outputs,
    timing: {},
  };
}

export function getNodeQuerySnapshot(nodeId: string, context: StudioNodeQueryContext) {
  return buildPreviewSnapshot(nodeId, context, new Set<string>());
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

export function getCallFunctionClassInfoQueryState(nodeId: string, context: StudioNodeQueryContext): CallFunctionClassInfoQueryState {
  const incomingDataEdges = context.edges.filter((edge) => edge.targetNodeId === nodeId && edge.channel === 'data');
  const boundEdge = incomingDataEdges.find((edge) => edge.targetPortId === 'class-info-in');

  if (!boundEdge) {
    if (incomingDataEdges.length > 0) {
      return {
        payload: null,
        methods: [],
        issues: [{
          severity: 'warning',
          code: 'query.call-function.port-mismatch',
          message: 'Incoming data is connected, but not to the required Class Info input port.',
          targetPortId: 'class-info-in',
        }],
      };
    }

    return {
      payload: null,
      methods: [],
      issues: [{
        severity: 'info',
        code: 'query.call-function.missing-edge',
        message: 'Connect a Class Info input first.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  const payload = getClassInfoPayloadFromValue(getConnectedInputPayload(nodeId, 'class-info-in', context));
  if (!payload) {
    return {
      payload: null,
      methods: [],
      issues: [{
        severity: 'error',
        code: 'query.call-function.invalid-payload',
        message: 'The upstream connection does not currently resolve to a valid Class Info payload.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  if (payload.functions.length === 0) {
    return {
      payload,
      methods: [],
      issues: [{
        severity: 'warning',
        code: 'query.call-function.no-functions',
        message: 'The upstream Class node does not export any functions.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  return {
    payload,
    methods: payload.functions,
    issues: [],
  };
}

export function getConnectedInputPayload(nodeId: string, targetPortId: string, context: StudioNodeQueryContext): unknown {
  const incomingEdge = context.edges.find((edge) => edge.targetNodeId === nodeId && edge.targetPortId === targetPortId && edge.channel === 'data');
  if (!incomingEdge) {
    return null;
  }

  return getNodeQuerySnapshot(incomingEdge.sourceNodeId, context)?.outputs[incomingEdge.sourcePortId]?.payload ?? null;
}

export function getConnectedClassInfoPayload(nodeId: string, context: StudioNodeQueryContext) {
  return getCallFunctionClassInfoQueryState(nodeId, context).payload;
}