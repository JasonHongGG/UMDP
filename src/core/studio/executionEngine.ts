import { globalNodeRegistry } from './NodeRegistry';
import {
  getIncomingEdges,
  getNodeOutputPort,
  getOutgoingFlowEdges,
  getStudioNodeById,
  validateNodeExecution,
} from './runtimeGraph';
import { NodeExecutionContext, NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from './types';

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

  const canMaterializePassiveJsonNode = (node: StudioNode) => {
    const hasFlowInputs = node.data.inputs.some((port) => port.type === 'flow');
    const hasJsonOutputs = node.data.outputs.some((port) => port.type === 'json');

    return !hasFlowInputs && hasJsonOutputs;
  };

  const createExecutionContext = (nodeId: string, resolving = new Set<string>()): NodeExecutionContext | null => {
    const node = getStudioNodeById(nodeId, nodes);
    if (!node) {
      return null;
    }

    const jsonInputPortIds = new Set(node.data.inputs.filter((port) => port.type === 'json').map((port) => port.id));

    const incoming = getIncomingEdges(nodeId, edges).reduce<NodeExecutionContext['incoming']>((acc, edge) => {
      if (!jsonInputPortIds.has(edge.targetPortId)) {
        return acc;
      }

      const sourceNode = getStudioNodeById(edge.sourceNodeId, nodes);
      const sourcePort = getNodeOutputPort(sourceNode, edge.sourcePortId);
      if (!sourceNode || sourcePort?.type !== 'json') {
        return acc;
      }

      let envelope = snapshots[sourceNode.id]?.outputs[edge.sourcePortId];

      if (!envelope && canMaterializePassiveJsonNode(sourceNode)) {
        materializePassiveJsonNode(sourceNode.id, resolving);
        envelope = snapshots[sourceNode.id]?.outputs[edge.sourcePortId];
      }

      if (!envelope) {
        return acc;
      }

      if (!acc[edge.targetPortId]) {
        acc[edge.targetPortId] = [];
      }

      acc[edge.targetPortId].push(envelope);
      return acc;
    }, {});

    return {
      node,
      nodes,
      edges,
      incoming,
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
    const context = createExecutionContext(nodeId, resolving);
    const startedAt = Date.now();

    if (!context) {
      resolving.delete(nodeId);
      return;
    }

    const validation = validateNodeExecution(context, definition);
    if (!validation.valid) {
      publishSnapshot({
        nodeId,
        state: 'error',
        inputs: context.incoming,
        outputs: {},
        error: validation.error ?? 'Node validation failed.',
        startedAt,
        completedAt: Date.now(),
      });
      resolving.delete(nodeId);
      return;
    }

    const result = definition.execute?.(context) ?? { state: 'success', outputs: {} };

    publishSnapshot({
      nodeId,
      state: result.state,
      inputs: context.incoming,
      outputs: result.outputs ?? {},
      error: result.state === 'error' ? result.error ?? 'Node execution failed.' : undefined,
      startedAt,
      completedAt: Date.now(),
    });

    resolving.delete(nodeId);
  };

  const runNode = (nodeId: string, delay: number) => {
    schedule(() => {
      const context = createExecutionContext(nodeId);
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