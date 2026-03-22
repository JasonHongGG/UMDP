import {
  getOutgoingFlowEdgesForPorts,
} from '../../../core/studio/runtimeGraph';
import { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from '../../../core/studio/types';
import type { ClassBinding, ClassInfoCatalog } from '../../../domain/studio/editor';
import type { StudioExecutionAbortReason } from '../../../domain/studio/contracts';
import {
  createExecutionTiming,
  executePreparedNode,
  prepareNodeExecution,
  canMaterializePassiveJsonNode,
  type GraphInterpreterEnvironment,
} from '../../../core/studio/graphInterpreter';

function logRuntimeFlowError(context: {
  runId: string;
  nodeId: string;
  reason: 'node-not-found' | 'execution-error';
  message: string;
  error?: unknown;
}) {
  console.log('[StudioFrontendError]', {
    runId: context.runId,
    nodeId: context.nodeId,
    phase: 'execute',
    reason: context.reason,
    message: context.message,
    error: context.error,
  });
}

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
  onRunStart?: (run: { runId: string; startNodeId: string; startedAt: number }) => void;
  onRunComplete?: (run: { runId: string; startNodeId: string; startedAt: number; completedAt: number; status: 'success' | 'error' | 'aborted'; abortReason?: StudioExecutionAbortReason }) => void;
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
  onRunStart,
  onRunComplete,
  stepDelayMs = 800,
}: ExecuteStudioFlowOptions) {
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const snapshots: Record<string, NodeExecutionSnapshot> = {};
  const nodeRuntimeStateById: Record<string, Record<string, unknown>> = {};
  const abortController = new AbortController();
  let disposed = false;
  const runId = `run-${Date.now()}`;
  const runStartedAt = Date.now();
  let pendingNodeCount = 0;
  let runHasErrors = false;
  let runWasAborted = false;
  let completionPublished = false;
  let cleanupReason: StudioExecutionAbortReason | undefined;

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
    nodeRuntimeStateById,
    runId,
    resolveStaticFieldAddress,
    getClassInfoCatalogByBinding,
    abortSignal: abortController.signal,
    reportNodeProgress: publishNodeProgress,
  };

  const publishRunCompletion = (status: 'success' | 'error' | 'aborted', abortReason?: StudioExecutionAbortReason) => {
    if (completionPublished) {
      return;
    }

    completionPublished = true;
    onRunComplete?.({
      runId,
      startNodeId,
      startedAt: runStartedAt,
      completedAt: Date.now(),
      status,
      abortReason,
    });
  };

  const settleNode = (status: NodeExecutionState) => {
    if (status === 'error') {
      runHasErrors = true;
    }

    if (status === 'aborted') {
      runWasAborted = true;
    }

    pendingNodeCount = Math.max(0, pendingNodeCount - 1);
    if (!disposed && pendingNodeCount === 0) {
      publishRunCompletion(runHasErrors ? 'error' : runWasAborted ? 'aborted' : 'success', cleanupReason);
    }
  };

  const publishAbortedSnapshots = (reason: StudioExecutionAbortReason) => {
    Object.values(snapshots).forEach((snapshot) => {
      if (snapshot.status !== 'running') {
        return;
      }

      onNodeStateChange(snapshot.nodeId, 'aborted');
      publishSnapshot({
        ...snapshot,
        status: 'aborted',
        phase: 'execute',
        failureReason: 'aborted',
        abortReason: reason,
        errorMessage: 'Execution aborted.',
        timing: createExecutionTiming(snapshot.timing?.startedAt, Date.now()),
        progress: undefined,
      });
      settleNode('aborted');
    });
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
    pendingNodeCount += 1;
    schedule(() => {
      void (async () => {
        if (disposed) {
          settleNode('aborted');
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
              logRuntimeFlowError({
                runId,
                nodeId,
                reason: 'node-not-found',
                message: 'Node not found.',
              });

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
                failureReason: 'node-not-found',
                timing: createExecutionTiming(startedAt, Date.now()),
                progress: undefined,
              });
              settleNode('error');
              return;
            }

            try {
              const snapshot = await executePreparedNode(prepared, 'runtime', { runId, phase: 'execute' });
              if (snapshot.status === 'success') {
                if (snapshot.nextRuntimeState) {
                  nodeRuntimeStateById[nodeId] = snapshot.nextRuntimeState;
                } else {
                  delete nodeRuntimeStateById[nodeId];
                }
              }
              onNodeStateChange(nodeId, snapshot.status);
              publishSnapshot(snapshot);

              if (snapshot.status === 'success') {
                getOutgoingFlowEdgesForPorts(nodeId, snapshot.nextControlPorts, nodes, edges).forEach((edge) => {
                  runNode(edge.targetNodeId, 0);
                });
              }

              settleNode(snapshot.status);
            } catch (error) {
              const isAbortError = error instanceof Error && error.name === 'AbortError';
              const status: NodeExecutionState = isAbortError ? 'aborted' : 'error';
              if (!isAbortError) {
                logRuntimeFlowError({
                  runId,
                  nodeId,
                  reason: 'execution-error',
                  message: error instanceof Error ? error.message : 'Node execution failed.',
                  error,
                });
              }
              onNodeStateChange(nodeId, 'error');
              publishSnapshot({
                nodeId,
                status,
                originKind: 'runtime',
                phase: 'execute',
                runId,
                inputs: incoming,
                outputs: {},
                errorMessage: error instanceof Error ? error.message : isAbortError ? 'Execution aborted.' : 'Node execution failed.',
                failureReason: isAbortError ? 'aborted' : 'execution-error',
                abortReason: isAbortError ? cleanupReason : undefined,
                timing: createExecutionTiming(startedAt, Date.now()),
                progress: undefined,
              });
              onNodeStateChange(nodeId, status);
              settleNode(status);
            }
          })();
        }, stepDelayMs);
      })().catch((error) => {
        const startedAt = Date.now();
        if (disposed) {
          return;
        }

        logRuntimeFlowError({
          runId,
          nodeId,
          reason: 'execution-error',
          message: error instanceof Error ? error.message : 'Node execution failed.',
          error,
        });

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
          failureReason: 'execution-error',
          timing: createExecutionTiming(startedAt, Date.now()),
          progress: undefined,
        });
        settleNode('error');
      });
    }, delay);
  };

  onReset();
  onRunStart?.({
    runId,
    startNodeId,
    startedAt: runStartedAt,
  });
  runNode(startNodeId, 0);

  return (reason: StudioExecutionAbortReason = 'manual-stop') => {
    if (disposed) {
      return;
    }

    cleanupReason = reason;
    publishAbortedSnapshots(reason);
    disposed = true;
    abortController.abort();
    timers.forEach((timer) => clearTimeout(timer));
    publishRunCompletion('aborted', reason);
  };
}
