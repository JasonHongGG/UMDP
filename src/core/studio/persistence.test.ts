import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloneGraphDocument,
  createEmptyGraphDocument,
  isGraphDocument,
  parseGraphDocument,
  readStoredGraphDocument,
  serializeGraphDocument,
  writeStoredGraphDocument,
} from './persistence';

describe('studio persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clones workflow documents deeply', () => {
    const original = createEmptyGraphDocument();
    original.nodes.push({
      id: 'node-a',
      nodeType: 'test-node',
      typeVersion: 1,
      position: { x: 12, y: 24 },
      parameters: {},
      bindings: {},
      documentState: {},
    });

    const cloned = cloneGraphDocument(original);
    cloned.nodes[0]!.position.x = 999;

    expect(original.nodes[0]!.position.x).toBe(12);
  });

  it('serializes and parses valid workflow documents', () => {
    const document = createEmptyGraphDocument();
    document.nodes.push({
      id: 'node-a',
      nodeType: 'test-node',
      typeVersion: 1,
      position: { x: 10, y: 20 },
      parameters: {},
      bindings: {},
      documentState: {},
    });

    const parsed = parseGraphDocument(serializeGraphDocument(document));

    expect(parsed).not.toBeNull();
    expect(isGraphDocument(parsed)).toBe(true);
    expect(parsed?.nodes[0]?.id).toBe('node-a');
  });

  it('preserves canonical class node document state without persistence-time mutation', () => {
    const document = createEmptyGraphDocument();
    document.nodes.push({
      id: 'class-node',
      nodeType: 'class-ref',
      typeVersion: 1,
      position: { x: 10, y: 20 },
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: 'image:a',
          classStableId: 'class:a',
          fullName: 'Gameplay.Player',
          name: 'Player',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: ['field:a'],
          staticStableIds: [],
          methodStableIds: [],
        },
      },
    });

    const parsed = parseGraphDocument(serializeGraphDocument(document));

    expect(parsed?.nodes[0]?.documentState).toEqual({
      classBinding: {
        imageStableId: 'image:a',
        classStableId: 'class:a',
        fullName: 'Gameplay.Player',
        name: 'Player',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      exportSelection: {
        memberStableIds: ['field:a'],
        staticStableIds: [],
        methodStableIds: [],
      },
    });
  });

  it('rejects malformed workflow payloads', () => {
    expect(parseGraphDocument('{"schemaVersion":1,"nodes":"invalid","dataConnections":[]}')).toBeNull();
    expect(isGraphDocument({ schemaVersion: 1, nodes: [], dataConnections: 'invalid' })).toBe(false);
  });

  it('reads and writes stored workflow records from localStorage', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const document = createEmptyGraphDocument();

    const savedAt = writeStoredGraphDocument('studio.test.workflow', document);
    const record = readStoredGraphDocument('studio.test.workflow');

    expect(savedAt).toBe(1_700_000_000_000);
    expect(record).toEqual({
      savedAt: 1_700_000_000_000,
      document,
    });

    nowSpy.mockRestore();
  });
});