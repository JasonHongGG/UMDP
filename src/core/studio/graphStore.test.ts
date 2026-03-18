import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '../../domain/studio/contracts';
import { createEmptyGraphDocument } from './persistence';
import { deriveStudioGraphCounters, isStudioGraphDocumentDirty, MAX_STUDIO_GRAPH_HISTORY_ENTRIES, pushStudioGraphHistoryEntry } from './graphStore';

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
});