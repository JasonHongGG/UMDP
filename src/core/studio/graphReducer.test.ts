import { describe, expect, it } from 'vitest';
import { createEmptyWorkflowDocument } from './persistence';
import { reduceStudioGraphDocument } from './graphReducer';
import type { BaseNodeData, StudioNode } from './types';

function createNode(id: string, outputIds: string[] = ['out'], inputIds: string[] = ['in']): StudioNode<BaseNodeData> {
  return {
    id,
    type: 'test-node',
    position: { x: 0, y: 0 },
    data: {
      inputs: inputIds.map((portId) => ({ id: portId, label: portId, type: 'flow' })),
      outputs: outputIds.map((portId) => ({ id: portId, label: portId, type: 'flow' })),
    },
  };
}

describe('reduceStudioGraphDocument', () => {
  it('adds nodes and de-duplicates identical edges', () => {
    const withNodes = reduceStudioGraphDocument(
      reduceStudioGraphDocument(createEmptyWorkflowDocument(), { type: 'add-node', node: createNode('node-a') }),
      { type: 'add-node', node: createNode('node-b') },
    );

    const withEdge = reduceStudioGraphDocument(withNodes, {
      type: 'connect-ports',
      edge: { id: 'edge-1', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' },
    });
    const duplicate = reduceStudioGraphDocument(withEdge, {
      type: 'connect-ports',
      edge: { id: 'edge-2', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' },
    });

    expect(withEdge.edges).toHaveLength(1);
    expect(duplicate.edges).toHaveLength(1);
  });

  it('replaces an existing inbound connection when a target port is reconnected', () => {
    const document = {
      ...createEmptyWorkflowDocument(),
      nodes: [createNode('node-a'), createNode('node-b'), createNode('node-c')],
      edges: [{ id: 'edge-1', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-c', targetPortId: 'in' }],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'connect-ports',
      edge: { id: 'edge-2', sourceNodeId: 'node-b', sourcePortId: 'out', targetNodeId: 'node-c', targetPortId: 'in' },
    });

    expect(next.edges).toEqual([
      { id: 'edge-2', sourceNodeId: 'node-b', sourcePortId: 'out', targetNodeId: 'node-c', targetPortId: 'in' },
    ]);
  });

  it('removes dangling edges when node ports are reconfigured', () => {
    const document = {
      ...createEmptyWorkflowDocument(),
      nodes: [createNode('node-a'), createNode('node-b')],
      edges: [{ id: 'edge-1', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' }],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'update-node-ports',
      nodeId: 'node-a',
      inputs: [],
      outputs: [{ id: 'different', label: 'different', type: 'flow' }],
    });

    expect(next.edges).toEqual([]);
  });

  it('deletes connected edges when a node is removed', () => {
    const document = {
      ...createEmptyWorkflowDocument(),
      nodes: [createNode('node-a'), createNode('node-b')],
      edges: [{ id: 'edge-1', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' }],
    };

    const next = reduceStudioGraphDocument(document, { type: 'delete-node', nodeId: 'node-a' });

    expect(next.nodes.map((node) => node.id)).toEqual(['node-b']);
    expect(next.edges).toEqual([]);
  });

  it('replaces the current document wholesale when requested', () => {
    const replacement = {
      ...createEmptyWorkflowDocument(),
      nodes: [createNode('replacement-node')],
      edges: [],
    };

    const next = reduceStudioGraphDocument(createEmptyWorkflowDocument(), {
      type: 'replace-document',
      document: replacement,
    });

    expect(next).toBe(replacement);
  });
});