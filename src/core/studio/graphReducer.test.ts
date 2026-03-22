import { describe, expect, it } from 'vitest';
import type { GraphDocument, NodeInstance } from '../../domain/studio/contracts';
import { createEmptyGraphDocument } from '../../infrastructure/studio/persistence/graphPersistence';
import { reduceStudioGraphDocument } from './graphReducer';

function createNode(id: string): NodeInstance {
  return {
    id,
    nodeType: 'test-node',
    typeVersion: 1,
    position: { x: 0, y: 0 },
    parameters: {},
    bindings: {},
    documentState: {},
  };
}

describe('reduceStudioGraphDocument', () => {
  it('adds nodes and de-duplicates identical edges', () => {
    const withNodes = reduceStudioGraphDocument(
      reduceStudioGraphDocument(createEmptyGraphDocument(), { type: 'add-node', node: createNode('node-a') }),
      { type: 'add-node', node: createNode('node-b') },
    );

    const withEdge = reduceStudioGraphDocument(withNodes, {
      type: 'connect-ports',
      edge: { id: 'edge-1', channel: 'control', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' },
    });
    const duplicate = reduceStudioGraphDocument(withEdge, {
      type: 'connect-ports',
      edge: { id: 'edge-2', channel: 'control', sourceNodeId: 'node-a', sourcePortId: 'out', targetNodeId: 'node-b', targetPortId: 'in' },
    });

    expect(withEdge.controlConnections).toHaveLength(1);
    expect(duplicate.controlConnections).toHaveLength(1);
  });

  it('replaces an existing inbound connection when a target port is reconnected', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b'), createNode('node-c')],
      controlConnections: [{ id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'out' }, target: { nodeId: 'node-c', connectionKey: 'in' } }],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'connect-ports',
      replaceEdgeIds: ['edge-1'],
      edge: { id: 'edge-2', channel: 'control', sourceNodeId: 'node-b', sourcePortId: 'out', targetNodeId: 'node-c', targetPortId: 'in' },
    });

    expect(next.controlConnections).toEqual([
      { id: 'edge-2', source: { nodeId: 'node-b', connectionKey: 'out' }, target: { nodeId: 'node-c', connectionKey: 'in' } },
    ]);
  });

  it('keeps existing edges when no replacement ids are provided', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b'), createNode('node-c')],
      dataConnections: [{ id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'json-out' }, target: { nodeId: 'node-c', connectionKey: 'json-in' }, bindingKey: 'json-in' }],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'connect-ports',
      edge: { id: 'edge-2', channel: 'data', sourceNodeId: 'node-b', sourcePortId: 'json-out', targetNodeId: 'node-c', targetPortId: 'json-in' },
    });

    expect(next.dataConnections).toEqual([
      { id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'json-out' }, target: { nodeId: 'node-c', connectionKey: 'json-in' }, bindingKey: 'json-in' },
      { id: 'edge-2', source: { nodeId: 'node-b', connectionKey: 'json-out' }, target: { nodeId: 'node-c', connectionKey: 'json-in' }, bindingKey: 'json-in' },
    ]);
  });

  it('updates a node instance wholesale when requested', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b')],
      controlConnections: [{ id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'out' }, target: { nodeId: 'node-b', connectionKey: 'in' } }],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'update-node-instance',
      nodeId: 'node-a',
      node: { ...createNode('node-a'), displayName: 'Updated' },
    });

    expect(next.nodes.find((node) => node.id === 'node-a')?.displayName).toBe('Updated');
    expect(next.controlConnections).toHaveLength(1);
  });

  it('updates multiple node positions in a single action', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b')],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'update-node-positions',
      updates: [
        { nodeId: 'node-a', position: { x: 10, y: 20 } },
        { nodeId: 'node-b', position: { x: 30, y: 40 } },
      ],
    });

    expect(next.nodes.map((node) => node.position)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('deletes connected edges when a node is removed', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b')],
      controlConnections: [{ id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'out' }, target: { nodeId: 'node-b', connectionKey: 'in' } }],
    };

    const next = reduceStudioGraphDocument(document, { type: 'delete-node', nodeId: 'node-a' });

    expect(next.nodes.map((node) => node.id)).toEqual(['node-b']);
    expect(next.controlConnections).toEqual([]);
  });

  it('deletes multiple selected nodes and their connected edges', () => {
    const document: GraphDocument = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('node-a'), createNode('node-b'), createNode('node-c')],
      controlConnections: [
        { id: 'edge-1', source: { nodeId: 'node-a', connectionKey: 'out' }, target: { nodeId: 'node-c', connectionKey: 'in' } },
        { id: 'edge-2', source: { nodeId: 'node-b', connectionKey: 'out' }, target: { nodeId: 'node-c', connectionKey: 'in' } },
      ],
      dataConnections: [
        { id: 'edge-3', source: { nodeId: 'node-c', connectionKey: 'json-out' }, target: { nodeId: 'node-a', connectionKey: 'json-in' }, bindingKey: 'json-in' },
      ],
    };

    const next = reduceStudioGraphDocument(document, {
      type: 'delete-nodes',
      nodeIds: ['node-a', 'node-b'],
    });

    expect(next.nodes.map((node) => node.id)).toEqual(['node-c']);
    expect(next.controlConnections).toEqual([]);
    expect(next.dataConnections).toEqual([]);
  });

  it('replaces the current document wholesale when requested', () => {
    const replacement = {
      ...createEmptyGraphDocument(),
      nodes: [createNode('replacement-node')],
    };

    const next = reduceStudioGraphDocument(createEmptyGraphDocument(), {
      type: 'replace-document',
      document: replacement,
    });

    expect(next).toBe(replacement);
  });
});