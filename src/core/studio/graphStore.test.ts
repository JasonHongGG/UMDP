import { describe, expect, it } from 'vitest';
import { createEmptyWorkflowDocument } from './persistence';
import { deriveStudioGraphCounters, isStudioGraphDocumentDirty, MAX_STUDIO_GRAPH_HISTORY_ENTRIES, pushStudioGraphHistoryEntry } from './graphStore';

describe('graphStore helpers', () => {
  it('derives the next node and edge counters from an existing document', () => {
    const document = createEmptyWorkflowDocument();
    document.nodes.push(
      {
        id: 'trigger-3',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { inputs: [], outputs: [] },
      },
      {
        id: 'class-ref-11',
        type: 'class-ref',
        position: { x: 100, y: 120 },
        data: { inputs: [], outputs: [] },
      },
    );
    document.edges.push({
      id: 'edge-9',
      sourceNodeId: 'trigger-3',
      sourcePortId: 'flow-out',
      targetNodeId: 'class-ref-11',
      targetPortId: 'flow-in',
    });

    expect(deriveStudioGraphCounters(document)).toEqual({
      nextNodeCounter: 12,
      nextEdgeCounter: 10,
    });
  });

  it('computes dirty state against the empty graph when no save snapshot exists', () => {
    const document = createEmptyWorkflowDocument();
    expect(isStudioGraphDocumentDirty(document, null)).toBe(false);

    document.nodes.push({
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { inputs: [], outputs: [] },
    });

    expect(isStudioGraphDocumentDirty(document, null)).toBe(true);
  });

  it('caps graph history entries and clones stored snapshots', () => {
    const baseHistory = Array.from({ length: MAX_STUDIO_GRAPH_HISTORY_ENTRIES }, (_, index) => ({
      version: 1,
      nodes: [{ id: `node-${index}`, type: 'test', position: { x: index, y: index }, data: { inputs: [], outputs: [] } }],
      edges: [],
    }));

    const nextDocument = {
      version: 1,
      nodes: [{ id: 'node-next', type: 'test', position: { x: 99, y: 101 }, data: { inputs: [], outputs: [] } }],
      edges: [],
    };

    const nextHistory = pushStudioGraphHistoryEntry(baseHistory, nextDocument);
    const lastEntry = nextHistory[nextHistory.length - 1];
    expect(nextHistory).toHaveLength(MAX_STUDIO_GRAPH_HISTORY_ENTRIES);
    expect(lastEntry).toEqual(nextDocument);
    expect(lastEntry).not.toBe(nextDocument);
  });
});