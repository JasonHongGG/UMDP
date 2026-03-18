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

interface ExecuteStudioFlowOptions {
  documentId?: string;
  startNodeId: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
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

  const canMaterializePassiveJsonNode = (node: StudioNode) => {
    const hasFlowInputs = getStudioNodePorts(node, 'input').some((port) => port.type === 'flow');
    const hasJsonOutputs = getStudioNodePorts(node, 'output').some((port) => port.type === 'json');

    return !hasFlowInputs && hasJsonOutputs;
  };

  const createExecutionContext = (nodeId: string, resolving = new Set<string>()): { context: NodeExecutionContext; inputs: NodeExecutionSnapshot['inputs'] } | null => {
    const node = getStudioNodeById(nodeId, nodes);
    if (!node) {
      return null;
    }

    getIncomingEdges(nodeId, edges).forEach((edge) => {
      if (edge.channel !== 'data') {
        return;
      }

      const sourceNode = getStudioNodeById(edge.sourceNodeId, nodes);
      if (!sourceNode || snapshots[sourceNode.id]?.outputs[edge.sourcePortId]) {
        return;
      }

      if (canMaterializePassiveJsonNode(sourceNode)) {
        materializePassiveJsonNode(sourceNode.id, resolving);
      }
    });

    const definition = globalNodeRegistry.get(node.type);
    const context = createNodeExecutionContext(documentId, nodeId, nodes, edges, snapshots, definition);
    if (!context) {
      return null;
    }

    return {
      context,
      inputs: getIncomingJsonInputs(nodeId, nodes, edges, snapshots),
    };
  };

  const materializePassiveJsonNode = (nodeId: string, resolving = new Set<string>()) => {
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
    const executionContext = createExecutionContext(nodeId, resolving);
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
        state: 'error',
        inputs: executionContext.inputs,
        outputs: {},
        issues: validationIssues,
        error: getPrimaryIssueMessage(validationIssues, 'Node validation failed.'),
        startedAt,
        completedAt: Date.now(),
      });
      resolving.delete(nodeId);
      return;
    }

    const result = definition.executionContract?.execute(executionContext.context) ?? { state: 'success', outputs: {} };
    if (result instanceof Promise) {
      throw new Error('Passive node execution does not support async contracts yet.');
    }

    publishSnapshot({
      nodeId,
      state: result.state,
      inputs: executionContext.inputs,
      outputs: (result.outputs as NodeExecutionSnapshot['outputs']) ?? {},
      issues: result.issues,
      error: result.state === 'error' ? getPrimaryIssueMessage(result.issues, 'Node execution failed.') : undefined,
      startedAt,
      completedAt: Date.now(),
    });

    resolving.delete(nodeId);
  };

  const runNode = (nodeId: string, delay: number) => {
    schedule(() => {
      const executionContext = createExecutionContext(nodeId);
      const startedAt = Date.now();
      const incoming = executionContext?.inputs ?? {};

      onNodeStateChange(nodeId, 'running');
      publishSnapshot({
        nodeId,
        state: 'running',
        inputs: incoming,
        outputs: {},
        startedAt,
      });

      schedule(() => {
        if (!executionContext) {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: {},
            error: 'Node not found.',
            startedAt,
            completedAt: Date.now(),
          });
          return;
        }

        const definition = globalNodeRegistry.get(executionContext.context.nodeType);
        if (!definition) {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: {},
            error: `Node definition not registered for type ${executionContext.context.nodeType}.`,
            startedAt,
            completedAt: Date.now(),
          });
          return;
        }

        const validationIssues = validateNodeExecution(executionContext.context, definition);
        const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');
        if (blockingIssues.length > 0) {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: {},
            issues: validationIssues,
            error: getPrimaryIssueMessage(validationIssues, 'Node validation failed.'),
            startedAt,
            completedAt: Date.now(),
          });
          return;
        }

        const finalizeResult = (result: DomainNodeExecutionResult) => {
          if (result.state === 'error') {
            onNodeStateChange(nodeId, 'error');
            publishSnapshot({
              nodeId,
              state: 'error',
              inputs: incoming,
              outputs: (result.outputs as NodeExecutionSnapshot['outputs']) ?? {},
              issues: result.issues,
              error: getPrimaryIssueMessage(result.issues, 'Node execution failed.'),
              startedAt,
              completedAt: Date.now(),
            });
            return;
          }

          onNodeStateChange(nodeId, 'success');
          publishSnapshot({
            nodeId,
            state: 'success',
            inputs: incoming,
            outputs: (result.outputs as NodeExecutionSnapshot['outputs']) ?? {},
            issues: result.issues,
            startedAt,
            completedAt: Date.now(),
          });

          getOutgoingFlowEdges(nodeId, nodes, edges).forEach((edge) => {
            runNode(edge.targetNodeId, 0);
          });
        };

        const result = definition.executionContract?.execute(executionContext.context) ?? { state: 'success', outputs: {} };
        if (result instanceof Promise) {
          void result.then(finalizeResult).catch((error) => {
            onNodeStateChange(nodeId, 'error');
            publishSnapshot({
              nodeId,
              state: 'error',
              inputs: incoming,
              outputs: {},
              error: error instanceof Error ? error.message : 'Node execution failed.',
              startedAt,
              completedAt: Date.now(),
            });
          });
          return;
        }

        finalizeResult(result);
      }, stepDelayMs);
    }, delay);
  };

  onReset();
  runNode(startNodeId, 0);

  return () => {
    timers.forEach((timer) => clearTimeout(timer));
  };
}