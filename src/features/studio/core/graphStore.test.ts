import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@/domain/studio/contracts';
import { createEmptyGraphDocument } from '@/infrastructure/studio/persistence/graphPersistence';
import { deriveStudioGraphCounters, duplicateStudioGraphSelection, isStudioGraphDocumentDirty, MAX_STUDIO_GRAPH_HISTORY_ENTRIES, pushStudioGraphHistoryEntry } from './graphStore';

describe('graphStore helpers', () => {
  it('derives the next node and edge counters from an existing document', () => {
    const document = createEmptyGraphDocument();
    document.nodes.push(
      {
        id: 'trigger-3',
        nodeType: 'trigger',
        typeVersion: 1,
        position: { x: 0, y: 0 },
        parameters: {},
        bindings: {},
        documentState: {},
      },
      {
        id: 'class-ref-11',
        nodeType: 'class-ref',
        typeVersion: 1,
        position: { x: 100, y: 120 },
        parameters: {},
        bindings: {},
        documentState: {},
      },
    );
    document.controlConnections.push({
      id: 'edge-9',
      source: { nodeId: 'trigger-3', connectionKey: 'flow-out' },
      target: { nodeId: 'class-ref-11', connectionKey: 'flow-in' },
    });

    expect(deriveStudioGraphCounters(document)).toEqual({
      nextNodeCounter: 12,
      nextEdgeCounter: 10,
    });
  });

  it('computes dirty state against the empty graph when no save snapshot exists', () => {
    const document = createEmptyGraphDocument();
    expect(isStudioGraphDocumentDirty(document, null)).toBe(false);

    document.nodes.push({
      id: 'trigger-1',
      nodeType: 'trigger',
      typeVersion: 1,
      position: { x: 0, y: 0 },
      parameters: {},
      bindings: {},
      documentState: {},
    });

    expect(isStudioGraphDocumentDirty(document, null)).toBe(true);
  });

  it('caps graph history entries and clones stored snapshots', () => {
    const baseHistory: GraphDocument[] = Array.from({ length: MAX_STUDIO_GRAPH_HISTORY_ENTRIES }, (_, index) => ({
      schemaVersion: 1,
      id: 'history-base',
      nodes: [{ id: `node-${index}`, nodeType: 'test', typeVersion: 1, position: { x: index, y: index }, parameters: {}, bindings: {}, documentState: {} }],
      controlConnections: [],
      dataConnections: [],
    }));

    const nextDocument: GraphDocument = {
      schemaVersion: 1,
      id: 'history-next',
      nodes: [{ id: 'node-next', nodeType: 'test', typeVersion: 1, position: { x: 99, y: 101 }, parameters: {}, bindings: {}, documentState: {} }],
      controlConnections: [],
      dataConnections: [],
    };

    const nextHistory = pushStudioGraphHistoryEntry(baseHistory, nextDocument);
    const lastEntry = nextHistory[nextHistory.length - 1];
    expect(nextHistory).toHaveLength(MAX_STUDIO_GRAPH_HISTORY_ENTRIES);
    expect(lastEntry).toEqual(nextDocument);
    expect(lastEntry).not.toBe(nextDocument);
  });

  it('duplicates selected nodes with their internal edges and applies an offset', () => {
    const document = createEmptyGraphDocument();
    document.nodes.push(
      {
        id: 'trigger-1',
        nodeType: 'trigger',
        typeVersion: 1,
        position: { x: 20, y: 30 },
        parameters: {},
        bindings: {},
        documentState: {},
      },
      {
        id: 'display-1',
        nodeType: 'display',
        typeVersion: 1,
        position: { x: 120, y: 150 },
        parameters: {},
        bindings: {},
        documentState: {},
      },
      {
        id: 'class-ref-1',
        nodeType: 'class-ref',
        typeVersion: 1,
        position: { x: 280, y: 160 },
        parameters: {},
        bindings: {},
        documentState: {},
      },
    );
    document.controlConnections.push({
      id: 'edge-1',
      source: { nodeId: 'trigger-1', connectionKey: 'flow-out' },
      target: { nodeId: 'display-1', connectionKey: 'flow-in' },
    });
    document.dataConnections.push({
      id: 'edge-2',
      source: { nodeId: 'display-1', connectionKey: 'payload-out' },
      target: { nodeId: 'class-ref-1', connectionKey: 'instance-in' },
      bindingKey: 'instance-in',
    });

    let nextNodeIndex = 10;
    let nextEdgeIndex = 20;
    const duplicated = duplicateStudioGraphSelection(
      document,
      ['trigger-1', 'display-1'],
      (nodeType) => `${nodeType}-${nextNodeIndex++}`,
      () => `edge-${nextEdgeIndex++}`,
      { offset: { x: 50, y: 60 } },
    );

    expect(duplicated.duplicatedNodeIds).toEqual(['trigger-10', 'display-11']);
    expect(duplicated.document.nodes.slice(-2)).toMatchObject([
      { id: 'trigger-10', position: { x: 70, y: 90 } },
      { id: 'display-11', position: { x: 170, y: 210 } },
    ]);
    expect(duplicated.document.controlConnections.slice(-1)).toEqual([
      {
        id: 'edge-20',
        source: { nodeId: 'trigger-10', connectionKey: 'flow-out' },
        target: { nodeId: 'display-11', connectionKey: 'flow-in' },
      },
    ]);
    expect(duplicated.document.dataConnections).toHaveLength(1);
  });
});