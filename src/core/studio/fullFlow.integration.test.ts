import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClassStableId, createImageStableId, createMethodStableId, createStableId } from '../../domain/contracts/shared-identity';
import { createLiteralExpressionSource } from './expression';
import { executeStudioFlow } from './executionEngine';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import type { NodeExecutionSnapshot, StudioNode } from './types';
import type { ClassBinding, ClassInfoCatalog } from '../../domain/studio/editor';
import { studioNodeCatalog } from '../../nodes';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const IMAGE_ID = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController', legacyClassId: 'player-controller' });
const METHOD_ID = createMethodStableId({ classStableId: CLASS_ID, methodName: 'Move', signature: 'System.Void (System.Single x)' });
const WORLD_DATA_CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'WorldData', legacyClassId: 'world-data' });
const WORLD_DATA_METHOD_ID = createMethodStableId({ classStableId: WORLD_DATA_CLASS_ID, methodName: 'Describe', signature: 'System.String ()' });
const ARGUMENT_ID = createStableId('binding', ['call-1', 'x']);

const BINDING: ClassBinding = {
  imageStableId: IMAGE_ID,
  classStableId: CLASS_ID,
  fullName: 'Gameplay.PlayerController',
  name: 'PlayerController',
  namespace: 'Gameplay',
  imageName: 'Assembly-CSharp.dll',
};

const CATALOG: ClassInfoCatalog = {
  members: [],
  statics: [],
  functions: [{
    id: METHOD_ID,
    label: 'Move',
    name: 'Move',
    signature: 'System.Void (System.Single x)',
    returnType: 'System.Void',
    parameters: [{ position: 0, name: 'x', typeName: 'System.Single' }],
    isStatic: false,
    tags: [],
  }],
};

const WORLD_DATA_BINDING: ClassBinding = {
  imageStableId: IMAGE_ID,
  classStableId: WORLD_DATA_CLASS_ID,
  fullName: 'Gameplay.WorldData',
  name: 'WorldData',
  namespace: 'Gameplay',
  imageName: 'Assembly-CSharp.dll',
};

const WORLD_DATA_CATALOG: ClassInfoCatalog = {
  members: [],
  statics: [],
  functions: [{
    id: WORLD_DATA_METHOD_ID,
    label: 'Describe',
    name: 'Describe',
    signature: 'System.String ()',
    returnType: 'System.String',
    parameters: [],
    isStatic: false,
    tags: [],
  }],
};

describe('studio full flow integration', () => {
  beforeEach(() => {
    initializeStudioNodeRegistry(studioNodeCatalog);
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    initializeStudioNodeRegistry([]);
  });

  it('executes trigger -> class -> call-function and emits a real runtime snapshot result', async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      classStableId: CLASS_ID,
      methodStableId: METHOD_ID,
      methodName: 'Move',
      methodSignature: 'System.Void (System.Single x)',
      returnType: 'System.Void',
      success: true,
      failureKind: 'none',
      error: null,
      exception: null,
      result: null,
    });

    const nodes: StudioNode[] = [
      { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'class-1',
        type: 'class-ref',
        position: { x: 180, y: 0 },
        data: {
          binding: BINDING,
          instanceSource: createLiteralExpressionSource('0x1234', 'string'),
          infoSelection: { members: [], statics: [], functions: [METHOD_ID] },
        },
      },
      {
        id: 'call-1',
        type: 'call-function',
        position: { x: 360, y: 0 },
        data: {
          selectedMethodStableId: METHOD_ID,
          arguments: [{ id: ARGUMENT_ID, name: 'x', source: createLiteralExpressionSource('1.5', 'number') }],
        },
      },
    ];

    const snapshots: Record<string, NodeExecutionSnapshot> = {};

    executeStudioFlow({
      documentId: 'doc-1',
      startNodeId: 'trigger-1',
      nodes,
      edges: [
        { id: 'edge-trigger-class', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'class-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-flow', channel: 'control', sourceNodeId: 'class-1', sourcePortId: 'flow-out', targetNodeId: 'call-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-data', channel: 'data', sourceNodeId: 'class-1', sourcePortId: 'info-out', targetNodeId: 'call-1', targetPortId: 'class-info-in' },
      ],
      resolveStaticFieldAddress: () => null,
      getClassInfoCatalogByBinding: (binding) => (binding?.classStableId === CLASS_ID ? CATALOG : null),
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots[snapshot.nodeId] = snapshot;
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith('invoke_runtime_method', {
      request: {
        classStableId: CLASS_ID,
        methodStableId: METHOD_ID,
        instanceAddress: '0x1234',
        arguments: [{ name: 'x', typeName: 'System.Single', valueKind: 'number', value: '1.5' }],
      },
    });

    expect(snapshots['call-1']).toMatchObject({
      status: 'success',
      originKind: 'runtime',
      phase: 'execute',
      outputs: {
        'result-out': {
          payload: {
            success: true,
            failureKind: 'none',
            method: {
              name: 'Move',
            },
            instanceAddress: '0x1234',
            arguments: [{ name: 'x', value: 1.5 }],
          },
        },
      },
    });
  });

  it('chains object return instance references into a downstream class node', async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      classStableId: CLASS_ID,
      methodStableId: METHOD_ID,
      methodName: 'Move',
      methodSignature: 'System.Void (System.Single x)',
      returnType: 'Gameplay.WorldData',
      success: true,
      failureKind: 'none',
      error: null,
      exception: null,
      result: {
        kind: 'object',
        value: null,
        objectAddress: '244190ab960',
      },
    });

    const nodes: StudioNode[] = [
      { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'class-1',
        type: 'class-ref',
        position: { x: 180, y: 0 },
        data: {
          binding: BINDING,
          instanceSource: createLiteralExpressionSource('0x1234', 'string'),
          infoSelection: { members: [], statics: [], functions: [METHOD_ID] },
        },
      },
      {
        id: 'call-1',
        type: 'call-function',
        position: { x: 360, y: 0 },
        data: {
          selectedMethodStableId: METHOD_ID,
          arguments: [{ id: ARGUMENT_ID, name: 'x', source: createLiteralExpressionSource('1.5', 'number') }],
        },
      },
      {
        id: 'class-2',
        type: 'class-ref',
        position: { x: 540, y: 0 },
        data: {
          binding: WORLD_DATA_BINDING,
          instanceSource: null,
          infoSelection: { members: [], statics: [], functions: [WORLD_DATA_METHOD_ID] },
        },
      },
    ];

    const snapshots: Record<string, NodeExecutionSnapshot> = {};

    executeStudioFlow({
      documentId: 'doc-1',
      startNodeId: 'trigger-1',
      nodes,
      edges: [
        { id: 'edge-trigger-class', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'class-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-flow', channel: 'control', sourceNodeId: 'class-1', sourcePortId: 'flow-out', targetNodeId: 'call-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-data', channel: 'data', sourceNodeId: 'class-1', sourcePortId: 'info-out', targetNodeId: 'call-1', targetPortId: 'class-info-in' },
        { id: 'edge-call-world-flow', channel: 'control', sourceNodeId: 'call-1', sourcePortId: 'flow-out', targetNodeId: 'class-2', targetPortId: 'flow-in' },
        { id: 'edge-call-world-instance', channel: 'data', sourceNodeId: 'call-1', sourcePortId: 'instance-ref-out', targetNodeId: 'class-2', targetPortId: 'instance-in' },
      ],
      resolveStaticFieldAddress: () => null,
      getClassInfoCatalogByBinding: (binding) => {
        if (binding?.classStableId === CLASS_ID) {
          return CATALOG;
        }

        return binding?.classStableId === WORLD_DATA_CLASS_ID ? WORLD_DATA_CATALOG : null;
      },
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots[snapshot.nodeId] = snapshot;
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(snapshots['call-1']).toMatchObject({
      outputs: {
        'instance-ref-out': {
          payload: {
            address: '0x244190AB960',
            sourceKind: 'call-function-result',
          },
        },
      },
    });
    expect(snapshots['class-2']).toMatchObject({
      status: 'success',
      outputs: {
        'info-out': {
          payload: {
            instanceAddress: '0x244190AB960',
            basic: {
              className: 'WorldData',
            },
          },
        },
      },
    });
  });

  it('routes call-function results into a display node runtime snapshot', async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      classStableId: CLASS_ID,
      methodStableId: METHOD_ID,
      methodName: 'Move',
      methodSignature: 'System.Void (System.Single x)',
      returnType: 'System.Void',
      success: true,
      failureKind: 'none',
      error: null,
      exception: null,
      result: null,
    });

    const nodes: StudioNode[] = [
      { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'class-1',
        type: 'class-ref',
        position: { x: 180, y: 0 },
        data: {
          binding: BINDING,
          instanceSource: createLiteralExpressionSource('0x1234', 'string'),
          infoSelection: { members: [], statics: [], functions: [METHOD_ID] },
        },
      },
      {
        id: 'call-1',
        type: 'call-function',
        position: { x: 360, y: 0 },
        data: {
          selectedMethodStableId: METHOD_ID,
          arguments: [{ id: ARGUMENT_ID, name: 'x', source: createLiteralExpressionSource('1.5', 'number') }],
        },
      },
      {
        id: 'display-1',
        type: 'display',
        position: { x: 540, y: 0 },
        data: {
          expandedByDefault: false,
          truncateAt: 180,
          showSchema: true,
          showMeta: true,
        },
      },
    ];

    const snapshots: Record<string, NodeExecutionSnapshot> = {};

    executeStudioFlow({
      documentId: 'doc-1',
      startNodeId: 'trigger-1',
      nodes,
      edges: [
        { id: 'edge-trigger-class', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'class-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-flow', channel: 'control', sourceNodeId: 'class-1', sourcePortId: 'flow-out', targetNodeId: 'call-1', targetPortId: 'flow-in' },
        { id: 'edge-class-call-data', channel: 'data', sourceNodeId: 'class-1', sourcePortId: 'info-out', targetNodeId: 'call-1', targetPortId: 'class-info-in' },
        { id: 'edge-call-display-flow', channel: 'control', sourceNodeId: 'call-1', sourcePortId: 'flow-out', targetNodeId: 'display-1', targetPortId: 'flow-in' },
        { id: 'edge-call-display-data', channel: 'data', sourceNodeId: 'call-1', sourcePortId: 'result-out', targetNodeId: 'display-1', targetPortId: 'payload-in' },
      ],
      resolveStaticFieldAddress: () => null,
      getClassInfoCatalogByBinding: (binding) => (binding?.classStableId === CLASS_ID ? CATALOG : null),
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots[snapshot.nodeId] = snapshot;
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(snapshots['display-1']).toMatchObject({
      status: 'success',
      originKind: 'runtime',
      phase: 'execute',
      inputs: {
        'payload-in': [{
          payload: {
            success: true,
            method: {
              name: 'Move',
            },
          },
        }],
      },
      outputs: {},
    });
  });
});