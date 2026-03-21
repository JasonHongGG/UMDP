import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredGraphDocument,
  cloneGraphDocument,
  createEmptyGraphDocument,
  isGraphDocument,
  parseGraphDocument,
  readStoredGraphDocument,
  serializeGraphDocument,
  writeStoredGraphDocument,
} from './persistence';
import {
  bootstrapStudioPersistencePolicy,
  readStudioWorkflowPersistenceSnapshot,
  readStudioWorkflowSlot,
  resetStudioWorkflowPersistence,
  writeStudioWorkflowSlot,
} from './persistencePolicy';

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

  it('strips legacy availableInfo from class node document state on parse', () => {
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
          memberStableIds: [],
          staticStableIds: [],
          methodStableIds: [],
        },
        availableInfo: {
          members: [{ id: 'field:a' }],
          statics: [],
          functions: [],
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
        memberStableIds: [],
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

  it('clears stored workflow records from localStorage', () => {
    const document = createEmptyGraphDocument();
    writeStoredGraphDocument('studio.test.workflow', document);

    clearStoredGraphDocument('studio.test.workflow');

    expect(readStoredGraphDocument('studio.test.workflow')).toBeNull();
  });

  it('boots v2 persistence by removing legacy v1 slots', () => {
    window.localStorage.setItem('unity-mono-studio.workflow.autosave.v1', '{"legacy":true}');
    window.localStorage.setItem('unity-mono-studio.workflow.manual-save.v1', '{"legacy":true}');

    bootstrapStudioPersistencePolicy();

    expect(window.localStorage.getItem('unity-mono-studio.workflow.autosave.v1')).toBeNull();
    expect(window.localStorage.getItem('unity-mono-studio.workflow.manual-save.v1')).toBeNull();
  });

  it('reads and writes v2 workflow slots through the persistence policy', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const document = createEmptyGraphDocument();
    document.id = 'workflow-v2';

    const savedAt = writeStudioWorkflowSlot('manual-save', document);
    const manualRecord = readStudioWorkflowSlot('manual-save');
    const snapshot = readStudioWorkflowPersistenceSnapshot();

    expect(savedAt).toBe(1_800_000_000_000);
    expect(manualRecord?.document.id).toBe('workflow-v2');
    expect(snapshot.manualSave?.savedAt).toBe(1_800_000_000_000);

    nowSpy.mockRestore();
  });

  it('resets v2 workflow slots through the persistence policy', () => {
    writeStudioWorkflowSlot('autosave', createEmptyGraphDocument());
    writeStudioWorkflowSlot('manual-save', createEmptyGraphDocument());

    resetStudioWorkflowPersistence();

    expect(readStudioWorkflowSlot('autosave')).toBeNull();
    expect(readStudioWorkflowSlot('manual-save')).toBeNull();
  });
});