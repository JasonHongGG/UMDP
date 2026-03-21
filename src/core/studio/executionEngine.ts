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
  const abortController = new AbortController();
  let disposed = false;
  const runId = `run-${Date.now()}`;

  const getPrimaryIssueMessage = (issues: ValidationIssue[] | undefined, fallback: string) => {
    const issue = issues?.find((entry) => entry.severity === 'error') ?? issues?.[0];
    return issue?.message ?? fallback;
  };

  const schedule = (callback: () => void, delay: number) => {
    if (disposed) {
      return;
    }

    const timer = setTimeout(callback, delay);
    timers.push(timer);
  };

  const publishSnapshot = (snapshot: NodeExecutionSnapshot) => {
    if (disposed) {
      return;
    }

    snapshots[snapshot.nodeId] = snapshot;
    onNodeSnapshot(snapshot);
  };

  const publishNodeProgress = (nodeId: string, progress: NodeExecutionSnapshot['progress'] | null) => {
    const previousSnapshot = snapshots[nodeId];
    if (!previousSnapshot) {
      return;
    }

    publishSnapshot({
      ...previousSnapshot,
      status: 'running',
      phase: 'execute',
      progress: progress ?? undefined,
    });
  };

  const environment: GraphInterpreterEnvironment = {
    documentId,
    nodes,
    edges,
    snapshots,
    runId,
    resolveStaticFieldAddress,
    getClassInfoCatalogByBinding,
    abortSignal: abortController.signal,
    reportNodeProgress: publishNodeProgress,
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
        if (disposed) {
          return;
        }

        const prepared = await prepareNodeExecution(nodeId, environment, {
          resolvePassiveDependencies: true,
          materializeNode: materializePassiveJsonNode,
        });
        const startedAt = Date.now();
        const incoming = prepared?.inputs ?? {};

        if (disposed) {
          return;
        }

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
            if (disposed) {
              return;
            }

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
                progress: undefined,
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
                progress: undefined,
              });
            }
          })();
        }, stepDelayMs);
      })().catch((error) => {
        const startedAt = Date.now();
        if (disposed) {
          return;
        }

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
          progress: undefined,
        });
      });
    }, delay);
  };

  onReset();
  runNode(startNodeId, 0);

  return () => {
    disposed = true;
    abortController.abort();
    timers.forEach((timer) => clearTimeout(timer));
  };
}