import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloneWorkflowDocument,
  createEmptyWorkflowDocument,
  isWorkflowDocument,
  parseWorkflowDocument,
  readStoredWorkflowDocument,
  serializeWorkflowDocument,
  writeStoredWorkflowDocument,
} from './persistence';

describe('studio persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clones workflow documents deeply', () => {
    const original = createEmptyWorkflowDocument();
    original.nodes.push({
      id: 'node-a',
      type: 'test-node',
      position: { x: 12, y: 24 },
      data: {
        inputs: [],
        outputs: [{ id: 'out', label: 'out', type: 'flow' }],
      },
    });

    const cloned = cloneWorkflowDocument(original);
    cloned.nodes[0]!.position.x = 999;

    expect(original.nodes[0]!.position.x).toBe(12);
  });

  it('serializes and parses valid workflow documents', () => {
    const document = createEmptyWorkflowDocument();
    document.nodes.push({
      id: 'node-a',
      type: 'test-node',
      position: { x: 10, y: 20 },
      data: {
        inputs: [],
        outputs: [{ id: 'out', label: 'out', type: 'flow' }],
      },
    });

    const parsed = parseWorkflowDocument(serializeWorkflowDocument(document));

    expect(parsed).not.toBeNull();
    expect(isWorkflowDocument(parsed)).toBe(true);
    expect(parsed?.nodes[0]?.id).toBe('node-a');
  });

  it('rejects malformed workflow payloads', () => {
    expect(parseWorkflowDocument('{"version":1,"nodes":"invalid","edges":[]}')).toBeNull();
    expect(isWorkflowDocument({ version: 1, nodes: [], edges: 'invalid' })).toBe(false);
  });

  it('reads and writes stored workflow records from localStorage', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const document = createEmptyWorkflowDocument();

    const savedAt = writeStoredWorkflowDocument('studio.test.workflow', document);
    const record = readStoredWorkflowDocument('studio.test.workflow');

    expect(savedAt).toBe(1_700_000_000_000);
    expect(record).toEqual({
      savedAt: 1_700_000_000_000,
      document,
    });

    nowSpy.mockRestore();
  });
});