import {
  getOutgoingFlowEdgesForPorts,
} from './runtimeGraph';
import { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from './types';
import type { ValidationIssue } from '../../domain/studio/contracts';
import type { ClassBinding, ClassInfoCatalog } from '../../domain/studio/editor';
import {
  createExecutionTiming,
  executePreparedNode,
  prepareNodeExecution,
  canMaterializePassiveJsonNode,
  type GraphInterpreterEnvironment,
} from './graphInterpreter';

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
  const runId = `run-${Date.now()}`;

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

  const environment: GraphInterpreterEnvironment = {
    documentId,
    nodes,
    edges,
    snapshots,
    runId,
    resolveStaticFieldAddress,
    getClassInfoCatalogByBinding,
  };

  const materializePassiveJsonNode = async (nodeId: string, resolving = new Set<string>()) => {
    if (snapshots[nodeId] || resolving.has(nodeId)) {
      return;
    }

    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || !canMaterializePassiveJsonNode(node)) {
      return;
    }

    resolving.add(nodeId);
    const prepared = await prepareNodeExecution(nodeId, environment, {
      resolvePassiveDependencies: true,
      materializeNode: materializePassiveJsonNode,
      resolving,
    });

    if (!prepared) {
      resolving.delete(nodeId);
      return;
    }

    publishSnapshot(await executePreparedNode(prepared, 'runtime', { runId: environment.runId }));

    resolving.delete(nodeId);
  };

  const runNode = (nodeId: string, delay: number) => {
    schedule(() => {
      void (async () => {
        const prepared = await prepareNodeExecution(nodeId, environment, {
          resolvePassiveDependencies: true,
          materializeNode: materializePassiveJsonNode,
        });
        const startedAt = Date.now();
        const incoming = prepared?.inputs ?? {};

        onNodeStateChange(nodeId, 'running');
        publishSnapshot({
          nodeId,
          status: 'running',
          originKind: 'runtime',
          phase: 'running',
          runId,
          inputs: incoming,
          outputs: {},
          timing: createExecutionTiming(startedAt),
        });

        schedule(() => {
          void (async () => {
            if (!prepared) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                originKind: 'runtime',
                phase: 'execute',
                runId,
                inputs: incoming,
                outputs: {},
                errorMessage: 'Node not found.',
                timing: createExecutionTiming(startedAt, Date.now()),
              });
              return;
            }

            try {
              const snapshot = await executePreparedNode(prepared, 'runtime', { runId, phase: 'execute' });
              onNodeStateChange(nodeId, snapshot.status === 'success' ? 'success' : 'error');
              publishSnapshot(snapshot);

              if (snapshot.status === 'success') {
                getOutgoingFlowEdgesForPorts(nodeId, snapshot.nextControlPorts, nodes, edges).forEach((edge) => {
                  runNode(edge.targetNodeId, 0);
                });
              }
            } catch (error) {
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status: 'error',
                originKind: 'runtime',
                phase: 'execute',
                runId,
                inputs: incoming,
                outputs: {},
                errorMessage: error instanceof Error ? error.message : 'Node execution failed.',
                timing: createExecutionTiming(startedAt, Date.now()),
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
          originKind: 'runtime',
          phase: 'execute',
          runId,
          inputs: {},
          outputs: {},
          errorMessage: error instanceof Error ? error.message : 'Node execution failed.',
          timing: createExecutionTiming(startedAt, Date.now()),
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