import { describe, expect, it } from 'vitest';
import type { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, WorkflowJsonEnvelope } from '@/features/studio/core/types';
import { getEdgeColor, isEdgeExecutionActive } from './EdgeLayer';
import { initializeStudioNodeRegistry } from '@/features/studio/core/NodeRegistry';

describe('getEdgeColor', () => {
  it('keeps the source port color while the edge is active', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'json-source',
          typeVersion: 1,
          family: 'data',
          displayName: 'Json Source',
          description: 'Produces json output',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: 'studio.json.generic' }],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    expect(getEdgeColor({
      id: 'edge-data',
      channel: 'data',
      sourceNodeId: 'json-source-1',
      sourcePortId: 'json-out',
      targetNodeId: 'target-1',
      targetPortId: 'payload-in',
    }, [{ id: 'json-source-1', type: 'json-source', position: { x: 0, y: 0 }, data: {} }], {})).toBe('#06b6d4');
  });
});

function createSnapshot(overrides: Partial<NodeExecutionSnapshot>): NodeExecutionSnapshot {
  return {
    nodeId: 'node',
    status: 'idle',
    originKind: 'runtime',
    phase: 'execute',
    inputs: {},
    outputs: {},
    ...overrides,
  };
}

describe('isEdgeExecutionActive', () => {
  it('activates control edges only for the running target selected by nextControlPorts', () => {
    const edge: StudioEdge = {
      id: 'edge-control',
      channel: 'control',
      sourceNodeId: 'class-node',
      sourcePortId: 'flow-out',
      targetNodeId: 'display-node',
      targetPortId: 'flow-in',
    };

    const nodeStates: Record<string, NodeExecutionState> = {
      'class-node': 'success',
      'display-node': 'running',
    };
    const nodeSnapshots = {
      'class-node': createSnapshot({
        nodeId: 'class-node',
        status: 'success',
        nextControlPorts: ['flow-out'],
      }),
      'display-node': createSnapshot({
        nodeId: 'display-node',
        status: 'running',
      }),
    };

    expect(isEdgeExecutionActive(edge, nodeStates, nodeSnapshots)).toBe(true);
  });

  it('activates control edges for running targets when the source uses default flow routing', () => {
    const edge: StudioEdge = {
      id: 'edge-control-default',
      channel: 'control',
      sourceNodeId: 'editor-node',
      sourcePortId: 'flow-out',
      targetNodeId: 'display-node',
      targetPortId: 'flow-in',
    };

    const nodeStates: Record<string, NodeExecutionState> = {
      'display-node': 'running',
    };
    const nodeSnapshots = {
      'editor-node': createSnapshot({
        nodeId: 'editor-node',
        status: 'success',
      }),
      'display-node': createSnapshot({
        nodeId: 'display-node',
        status: 'running',
      }),
    };

    expect(isEdgeExecutionActive(edge, nodeStates, nodeSnapshots)).toBe(true);
  });

  it('activates data edges only when the running target is consuming the exact source envelope', () => {
    const envelope: WorkflowJsonEnvelope = {
      kind: 'json',
      schema: { id: 'demo', version: 1 },
      payload: { value: 1 },
    };
    const edge: StudioEdge = {
      id: 'edge-data',
      channel: 'data',
      sourceNodeId: 'class-node',
      sourcePortId: 'info-out',
      targetNodeId: 'display-node',
      targetPortId: 'payload-in',
    };

    const nodeStates: Record<string, NodeExecutionState> = {
      'display-node': 'running',
    };
    const nodeSnapshots = {
      'class-node': createSnapshot({
        nodeId: 'class-node',
        status: 'success',
        outputs: { 'info-out': envelope },
      }),
      'display-node': createSnapshot({
        nodeId: 'display-node',
        status: 'running',
        inputs: { 'payload-in': [envelope] },
      }),
    };

    expect(isEdgeExecutionActive(edge, nodeStates, nodeSnapshots)).toBe(true);
  });

  it('does not activate edges for targets that are not running', () => {
    const edge: StudioEdge = {
      id: 'edge-idle',
      channel: 'data',
      sourceNodeId: 'class-node',
      sourcePortId: 'info-out',
      targetNodeId: 'display-node',
      targetPortId: 'payload-in',
    };

    expect(isEdgeExecutionActive(edge, { 'display-node': 'idle' }, {})).toBe(false);
  });
});