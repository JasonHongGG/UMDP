import { globalNodeRegistry } from './NodeRegistry';
import { createNodeExecutionContext, getOutgoingFlowEdges, validateNodeExecution } from './runtimeGraph';
import { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from './types';

interface ExecuteStudioFlowOptions {
  startNodeId: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
  onReset: () => void;
  onNodeStateChange: (nodeId: string, state: NodeExecutionState) => void;
  onNodeSnapshot: (snapshot: NodeExecutionSnapshot) => void;
  stepDelayMs?: number;
}

export function executeStudioFlow({
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

  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timers.push(timer);
  };

  const publishSnapshot = (snapshot: NodeExecutionSnapshot) => {
    snapshots[snapshot.nodeId] = snapshot;
    onNodeSnapshot(snapshot);
  };

  const runNode = (nodeId: string, delay: number) => {
    schedule(() => {
      const context = createNodeExecutionContext(nodeId, nodes, edges, snapshots);
      const startedAt = Date.now();
      const incoming = context?.incoming ?? {};

      onNodeStateChange(nodeId, 'running');
      publishSnapshot({
        nodeId,
        state: 'running',
        inputs: incoming,
        outputs: {},
        startedAt,
      });

      schedule(() => {
        if (!context) {
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

        const definition = globalNodeRegistry.get(context.node.type);
        if (!definition) {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: {},
            error: `Node definition not registered for type ${context.node.type}.`,
            startedAt,
            completedAt: Date.now(),
          });
          return;
        }

        const validation = validateNodeExecution(context, definition);
        if (!validation.valid) {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: {},
            error: validation.error ?? 'Node validation failed.',
            startedAt,
            completedAt: Date.now(),
          });
          return;
        }

        const result = definition.execute?.(context) ?? { state: 'success', outputs: {} };

        if (result.state === 'error') {
          onNodeStateChange(nodeId, 'error');
          publishSnapshot({
            nodeId,
            state: 'error',
            inputs: incoming,
            outputs: result.outputs ?? {},
            error: result.error ?? 'Node execution failed.',
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
          outputs: result.outputs ?? {},
          startedAt,
          completedAt: Date.now(),
        });

        getOutgoingFlowEdges(nodeId, nodes, edges).forEach((edge) => {
          runNode(edge.targetNodeId, 0);
        });
      }, stepDelayMs);
    }, delay);
  };

  onReset();
  runNode(startNodeId, 0);

  return () => {
    timers.forEach((timer) => clearTimeout(timer));
  };
}