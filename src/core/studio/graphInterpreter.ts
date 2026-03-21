import { getStudioNodePorts } from './NodeRegistry';
import {
  createNodeExecutionContext,
  getIncomingEdges,
  getIncomingJsonInputs,
  getStudioNodeById,
  validateNodeExecution,
} from './runtimeGraph';
import type { StudioNodeQueryContext } from './queryTypes';
import type { NodeExecutionSnapshot, StudioEdge, StudioNode, StudioNodeDefinition } from './types';
import type { NodeExecutionContext, ValidationIssue } from '../../domain/studio/contracts';
import type { ClassBinding, ClassInfoCatalog } from '../../domain/studio/editor';
import { getRegisteredStudioNodeCatalog } from './catalog/studioNodeCatalogRuntime';

export interface GraphInterpreterEnvironment {
  documentId: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
  snapshots: Record<string, NodeExecutionSnapshot>;
  nodeRuntimeStateById?: Record<string, Record<string, unknown>>;
  runId?: string;
  resolveStaticFieldAddress?: (classStableId: string, memberStableId: string) => string | null;
  getClassInfoCatalogByBinding?: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null;
  abortSignal?: AbortSignal;
  reportNodeProgress?: (nodeId: string, progress: NodeExecutionSnapshot['progress'] | null) => void;
}

export interface PreparedNodeExecution {
  node: StudioNode;
  definition: StudioNodeDefinition;
  context: NodeExecutionContext;
  inputs: NodeExecutionSnapshot['inputs'];
}

function getPrimaryIssueMessage(issues: ValidationIssue[] | undefined, fallback: string) {
  const issue = issues?.find((entry) => entry.severity === 'error') ?? issues?.[0];
  return issue?.message ?? fallback;
}

export function createExecutionTiming(startedAt?: number, completedAt?: number) {
  return {
    startedAt,
    completedAt,
    durationMs: startedAt !== undefined && completedAt !== undefined ? completedAt - startedAt : undefined,
  };
}

export function createQueryRevision() {
  return Date.now();
}

export function createMaterializedNodeSnapshot(
  nodeId: string,
  outputs: NodeExecutionSnapshot['outputs'],
  queryRevision: number,
): NodeExecutionSnapshot {
  return {
    nodeId,
    status: 'success',
    originKind: 'materialized',
    phase: 'materialize',
    queryRevision,
    inputs: {},
    outputs,
    nextControlPorts: undefined,
    timing: {},
  };
}

export function createExecutionNodeSnapshot(
  nodeId: string,
  originKind: NodeExecutionSnapshot['originKind'],
  status: NodeExecutionSnapshot['status'],
  inputs: NodeExecutionSnapshot['inputs'],
  outputs: NodeExecutionSnapshot['outputs'],
  timing: NodeExecutionSnapshot['timing'],
  options?: {
    issues?: NodeExecutionSnapshot['issues'];
    nextControlPorts?: NodeExecutionSnapshot['nextControlPorts'];
    nextRuntimeState?: NodeExecutionSnapshot['nextRuntimeState'];
    errorMessage?: string;
    runId?: string;
    queryRevision?: number;
    phase?: NodeExecutionSnapshot['phase'];
  },
): NodeExecutionSnapshot {
  return {
    nodeId,
    status,
    originKind,
    phase: options?.phase ?? 'execute',
    runId: options?.runId,
    queryRevision: options?.queryRevision,
    inputs,
    outputs,
    issues: options?.issues,
    nextControlPorts: options?.nextControlPorts,
    nextRuntimeState: options?.nextRuntimeState,
    errorMessage: options?.errorMessage,
    timing,
  };
}

export function canMaterializePassiveJsonNode(node: StudioNode) {
  const catalog = getRegisteredStudioNodeCatalog();
  const hasFlowInputs = getStudioNodePorts(node, 'input', catalog).some((port) => port.type === 'flow');
  const hasJsonOutputs = getStudioNodePorts(node, 'output', catalog).some((port) => port.type === 'json');

  return !hasFlowInputs && hasJsonOutputs;
}

export async function materializePassiveDependencies(
  nodeId: string,
  environment: GraphInterpreterEnvironment,
  materializeNode: (nodeId: string, resolving: Set<string>) => Promise<void>,
  resolving = new Set<string>(),
) {
  for (const edge of getIncomingEdges(nodeId, environment.edges)) {
    if (edge.channel !== 'data') {
      continue;
    }

    const sourceNode = getStudioNodeById(edge.sourceNodeId, environment.nodes);
    if (!sourceNode || environment.snapshots[sourceNode.id]?.outputs[edge.sourcePortId]) {
      continue;
    }

    if (canMaterializePassiveJsonNode(sourceNode)) {
      await materializeNode(sourceNode.id, resolving);
    }
  }
}

export async function prepareNodeExecution(
  nodeId: string,
  environment: GraphInterpreterEnvironment,
  options?: {
    resolvePassiveDependencies?: boolean;
    materializeNode?: (nodeId: string, resolving: Set<string>) => Promise<void>;
    resolving?: Set<string>;
  },
): Promise<PreparedNodeExecution | null> {
  const node = getStudioNodeById(nodeId, environment.nodes);
  if (!node) {
    return null;
  }

  if (options?.resolvePassiveDependencies && options.materializeNode) {
    await materializePassiveDependencies(
      nodeId,
      environment,
      options.materializeNode,
      options.resolving ?? new Set<string>(),
    );
  }

  const definition = getRegisteredStudioNodeCatalog().get(node.type);
  if (!definition) {
    return null;
  }

  const context = createNodeExecutionContext(
    environment.documentId,
    nodeId,
    environment.nodes,
    environment.edges,
    environment.snapshots,
    definition,
    environment.nodeRuntimeStateById?.[nodeId],
    environment.resolveStaticFieldAddress,
    environment.getClassInfoCatalogByBinding,
    environment.abortSignal,
    (progress) => environment.reportNodeProgress?.(nodeId, progress),
  );

  if (!context) {
    return null;
  }

  return {
    node,
    definition,
    context,
    inputs: getIncomingJsonInputs(nodeId, environment.nodes, environment.edges, environment.snapshots),
  };
}

export async function executePreparedNode(
  prepared: PreparedNodeExecution,
  originKind: NodeExecutionSnapshot['originKind'],
  options?: {
    runId?: string;
    phase?: NodeExecutionSnapshot['phase'];
    queryRevision?: number;
  },
): Promise<NodeExecutionSnapshot> {
  const startedAt = Date.now();
  const validationIssues = validateNodeExecution(prepared.context, prepared.definition);
  const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');

  if (blockingIssues.length > 0) {
    return createExecutionNodeSnapshot(
      prepared.node.id,
      originKind,
      'error',
      prepared.inputs,
      {},
      createExecutionTiming(startedAt, Date.now()),
      {
        phase: options?.phase,
        runId: options?.runId,
        queryRevision: options?.queryRevision,
        issues: validationIssues,
        errorMessage: getPrimaryIssueMessage(validationIssues, 'Node validation failed.'),
      },
    );
  }

  try {
    const result = prepared.definition.executionContract?.execute(prepared.context) ?? { state: 'success' as const, outputs: {} };
    const resolvedResult = result instanceof Promise ? await result : result;

    if (resolvedResult.state === 'error') {
      return createExecutionNodeSnapshot(
        prepared.node.id,
        originKind,
        'error',
        prepared.inputs,
        (resolvedResult.outputs as NodeExecutionSnapshot['outputs']) ?? {},
        createExecutionTiming(startedAt, Date.now()),
        {
          phase: options?.phase,
          runId: options?.runId,
          queryRevision: options?.queryRevision,
          issues: resolvedResult.issues,
          errorMessage: getPrimaryIssueMessage(resolvedResult.issues, 'Node execution failed.'),
          nextRuntimeState: resolvedResult.nextRuntimeState,
        },
      );
    }

    return createExecutionNodeSnapshot(
      prepared.node.id,
      originKind,
      'success',
      prepared.inputs,
      (resolvedResult.outputs as NodeExecutionSnapshot['outputs']) ?? {},
      createExecutionTiming(startedAt, Date.now()),
      {
        phase: options?.phase,
        runId: options?.runId,
        queryRevision: options?.queryRevision,
        issues: resolvedResult.issues,
        nextControlPorts: resolvedResult.nextControlPorts,
        nextRuntimeState: resolvedResult.nextRuntimeState,
      },
    );
  } catch (error) {
    return createExecutionNodeSnapshot(
      prepared.node.id,
      originKind,
      'error',
      prepared.inputs,
      {},
      createExecutionTiming(startedAt, Date.now()),
      {
        phase: options?.phase,
        runId: options?.runId,
        queryRevision: options?.queryRevision,
        errorMessage: error instanceof Error ? error.message : 'Node execution failed.',
      },
    );
  }
}

export function materializeNodeQuerySnapshot(
  nodeId: string,
  context: StudioNodeQueryContext,
  resolving = new Set<string>(),
  queryRevision = createQueryRevision(),
): NodeExecutionSnapshot | null {
  const runtimeSnapshot = context.nodeSnapshots[nodeId];
  if (runtimeSnapshot) {
    return runtimeSnapshot;
  }

  if (resolving.has(nodeId)) {
    return null;
  }

  const node = context.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return null;
  }

  resolving.add(nodeId);

  const dependencySnapshots = getIncomingEdges(nodeId, context.edges).reduce<Record<string, NodeExecutionSnapshot>>((acc, edge) => {
    const dependencySnapshot = materializeNodeQuerySnapshot(edge.sourceNodeId, context, resolving, queryRevision);
    if (dependencySnapshot) {
      acc[dependencySnapshot.nodeId] = dependencySnapshot;
    }
    return acc;
  }, {});

  const nodeDef = getRegisteredStudioNodeCatalog().get(node.type);
  const snapshots = {
    ...context.nodeSnapshots,
    ...dependencySnapshots,
  };

  const queryOutputs = nodeDef?.buildQueryOutputs?.(node as never, context, snapshots);
  if (queryOutputs) {
    resolving.delete(nodeId);
    return createMaterializedNodeSnapshot(node.id, queryOutputs, queryRevision);
  }

  resolving.delete(nodeId);
  return null;
}