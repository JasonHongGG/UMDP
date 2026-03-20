import { getStudioNodePorts, globalNodeRegistry } from './NodeRegistry';
import {
  createNodeExecutionContext,
  getIncomingEdges,
  getOutgoingFlowEdges,
  getStudioNodeById,
  getIncomingJsonInputs,
  validateNodeExecution,
} from './runtimeGraph';
import { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from './types';
import type { NodeExecutionContext, NodeExecutionResult as DomainNodeExecutionResult, ValidationIssue } from '../../domain/studio/contracts';
import type { ClassBinding, ClassInfoCatalog } from '../../domain/studio/editor';

interface ExecuteStudioFlowOptions {
  documentId?: string;
  startNodeId: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
  resolveStaticFieldAddress?: (classStableId: string, memberStableId: string) => string | null;
  getClassInfoCatalogByBinding?: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null;
  onReset: () => void;
  onNodeStateChange: (nodeId: string, state: NodeExecutionState) => void;
  onNodeSnapshot: (snapshot: NodeExecutionSnapshot) => void;
  stepDelayMs?: number;
}

export function executeStudioFlow({
  documentId = 'studio-document',
  startNodeId,
  nodes,
  edges,
  resolveStaticFieldAddress,
  getClassInfoCatalogByBinding,
  onReset,
  onNodeStateChange,
  onNodeSnapshot,
  stepDelayMs = 800,
}: ExecuteStudioFlowOptions) {
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const snapshots: Record<string, NodeExecutionSnapshot> = {};

  const getPrimaryIssueMessage = (issues: ValidationIssue[] | undefined, fallback: string) => {
    const issue = issues?.find((entry) => entry.severity === 'error') ?? issues?.[0];
    return issue?.message ?? fallback;
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timers.push(timer);
  };

  const publishSnapshot = (snapshot: NodeExecutionSnapshot) => {
    snapshots[snapshot.nodeId] = snapshot;
    onNodeSnapshot(snapshot);
  };

  const createTiming = (startedAt?: number, completedAt?: number) => ({
    startedAt,
    completedAt,
    durationMs: startedAt !== undefined && completedAt !== undefined ? completedAt - startedAt : undefined,
  });

  const canMaterializePassiveJsonNode = (node: StudioNode) => {
    const hasFlowInputs = getStudioNodePorts(node, 'input').some((port) => port.type === 'flow');
    const hasJsonOutputs = getStudioNodePorts(node, 'output').some((port) => port.type === 'json');

    return !hasFlowInputs && hasJsonOutputs;
  };

  const createExecutionContext = async (nodeId: string, resolving = new Set<string>()): Promise<{ context: NodeExecutionContext; inputs: NodeExecutionSnapshot['inputs'] } | null> => {
    const node = getStudioNodeById(nodeId, nodes);
    if (!node) {
      return null;
    }

    for (const edge of getIncomingEdges(nodeId, edges)) {
      if (edge.channel !== 'data') {
        continue;
      }

      const sourceNode = getStudioNodeById(edge.sourceNodeId, nodes);
      if (!sourceNode || snapshots[sourceNode.id]?.outputs[edge.sourcePortId]) {
        continue;
      }

      if (canMaterializePassiveJsonNode(sourceNode)) {
        await materializePassiveJsonNode(sourceNode.id, resolving);
      }
    }

    const definition = globalNodeRegistry.get(node.type);
    const context = createNodeExecutionContext(documentId, nodeId, nodes, edges, snapshots, definition, resolveStaticFieldAddress, getClassInfoCatalogByBinding);
    if (!context) {
      return null;
    }

    return {
      context,
      inputs: getIncomingJsonInputs(nodeId, nodes, edges, snapshots),
    };
  };

  const materializePassiveJsonNode = async (nodeId: string, resolving = new Set<string>()) => {
    if (snapshots[nodeId] || resolving.has(nodeId)) {
      return;
    }

    const node = getStudioNodeById(nodeId, nodes);
    if (!node || !canMaterializePassiveJsonNode(node)) {
      return;
    }

    const definition = globalNodeRegistry.get(node.type);
    if (!definition) {
      return;
    }

    resolving.add(nodeId);
    const executionContext = await createExecutionContext(nodeId, resolving);
    const startedAt = Date.now();

    if (!executionContext) {
      resolving.delete(nodeId);
      return;
    }

    const validationIssues = validateNodeExecution(executionContext.context, definition);
    const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');
    if (blockingIssues.length > 0) {
      publishSnapshot({
        nodeId,
        status: 'error',
        source: 'materialized',
        inputs: executionContext.inputs,
        outputs: {},
        issues: validationIssues,
        errorMessage: getPrimaryIssueMessage(validationIssues, 'Node validation failed.'),
        timing: createTiming(startedAt, Date.now()),
      });
      resolving.delete(nodeId);
      return;
    }

    const result = definition.executionContract?.execute(executionContext.context) ?? { state: 'success', outputs: {} };
    const resolvedResult = result instanceof Promise ? await result : result;

    publishSnapshot({
      nodeId,
      status: resolvedResult.state,
      source: 'runtime',
      inputs: executionContext.inputs,
      outputs: (resolvedResult.outputs as NodeExecutionSnapshot['outputs']) ?? {},
      issues: resolvedResult.issues,
      errorMessage: resolvedResult.state === 'error' ? getPrimaryIssueMessage(resolvedResult.issues, 'Node execution failed.') : undefined,
      timing: createTiming(startedAt, Date.now()),
    });

    resolving.delete(nodeId);
  };

  const runNode = (nodeId: string, delay: number) => {
    schedule(() => {
      void (async () => {
        const executionContext = await createExecutionContext(nodeId);
        const startedAt = Date.now();
        const incoming = executionContext?.inputs ?? {};

        onNodeStateChange(nodeId, 'running');
        publishSnapshot({
          nodeId,
          status: 'running',
          source: 'runtime',
          inputs: incoming,
          outputs: {},
          timing: createTiming(startedAt),
        });

        schedule(() => {
          void (async () => {
            if (!executionContext) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                source: 'runtime',
                inputs: incoming,
                outputs: {},
                errorMessage: 'Node not found.',
                timing: createTiming(startedAt, Date.now()),
              });
              return;
            }

            const definition = globalNodeRegistry.get(executionContext.context.nodeType);
            if (!definition) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                source: 'runtime',
                inputs: incoming,
                outputs: {},
                errorMessage: `Node definition not registered for type ${executionContext.context.nodeType}.`,
                timing: createTiming(startedAt, Date.now()),
              });
              return;
            }

            const validationIssues = validateNodeExecution(executionContext.context, definition);
            const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');
            if (blockingIssues.length > 0) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                source: 'runtime',
                inputs: incoming,
                outputs: {},
                issues: validationIssues,
                errorMessage: getPrimaryIssueMessage(validationIssues, 'Node validation failed.'),
                timing: createTiming(startedAt, Date.now()),
              });
              return;
            }

            const finalizeResult = (result: DomainNodeExecutionResult) => {
              if (result.state === 'error') {
                onNodeStateChange(nodeId, 'error');
                publishSnapshot({
                  nodeId,
                  status: 'error',
                  source: 'runtime',
                  inputs: incoming,
                  outputs: (result.outputs as NodeExecutionSnapshot['outputs']) ?? {},
                  issues: result.issues,
                  errorMessage: getPrimaryIssueMessage(result.issues, 'Node execution failed.'),
                  timing: createTiming(startedAt, Date.now()),
                });
                return;
              }

              onNodeStateChange(nodeId, 'success');
              publishSnapshot({
                nodeId,
                status: 'success',
                source: 'runtime',
                inputs: incoming,
                outputs: (result.outputs as NodeExecutionSnapshot['outputs']) ?? {},
                issues: result.issues,
                timing: createTiming(startedAt, Date.now()),
              });

              getOutgoingFlowEdges(nodeId, nodes, edges).forEach((edge) => {
                runNode(edge.targetNodeId, 0);
              });
            };

            try {
              const result = definition.executionContract?.execute(executionContext.context) ?? { state: 'success', outputs: {} };
              const resolvedResult = result instanceof Promise ? await result : result;
              finalizeResult(resolvedResult);
            } catch (error) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                source: 'runtime',
                inputs: incoming,
                outputs: {},
                errorMessage: error instanceof Error ? error.message : 'Node execution failed.',
                timing: createTiming(startedAt, Date.now()),
              });
            }
          })();
        }, stepDelayMs);
      })().catch((error) => {
        const startedAt = Date.now();
        onNodeStateChange(nodeId, 'error');
        publishSnapshot({
          nodeId,
          status: 'error',
          source: 'runtime',
          inputs: {},
          outputs: {},
          errorMessage: error instanceof Error ? error.message : 'Node execution failed.',
          timing: createTiming(startedAt, Date.now()),
        });
      });
    }, delay);
  };

  onReset();
  runNode(startNodeId, 0);

  return () => {
    timers.forEach((timer) => clearTimeout(timer));
  };
}