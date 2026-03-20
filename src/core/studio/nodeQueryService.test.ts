import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createInputExpressionSource, createLiteralExpressionSource, resolveExpressionSource } from './expression';
import { getConnectedClassInfoPayload, getNodeInputBindingStates, getNodeOutputPreview, getNodeQuerySnapshot, getNodeQueryState, type StudioNodeQueryContext } from './nodeQueryService';
import type { StudioRuntimeDataState } from './runtimeData';
import type { StudioEdge, StudioNode } from './types';
import {
  createClassStableId,
  createImageStableId,
  createMethodStableId,
  type StableId,
} from '../../domain/contracts/shared-identity';
import type { ClassBinding, ClassInfoCatalog, StudioClassCatalogEntry } from '../../domain/studio/editor';
import type { CallFunctionClassInfoQueryState } from '../../domain/studio/contracts';
import { studioNodeCatalog } from '../../nodes';

const IMAGE_ID = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController', legacyClassId: 'player-controller' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_ID, methodName: 'Move', signature: 'System.Void (System.Single x, System.Single y)' });

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
    id: METHOD_MOVE,
    label: 'Move',
    name: 'Move',
    signature: 'System.Void (System.Single x, System.Single y)',
    returnType: 'System.Void',
    parameters: [
      { position: 0, name: 'x', typeName: 'System.Single' },
      { position: 1, name: 'y', typeName: 'System.Single' },
    ],
    isStatic: false,
    tags: [],
  }],
};

function createRuntimeData(): StudioRuntimeDataState {
  const classes: StudioClassCatalogEntry[] = [{
    ...BINDING,
    searchText: 'gameplay playercontroller assembly-csharp.dll',
  }];

  return {
    classes,
    classCatalog: {
      createNodeRequest: () => null,
      getByBinding: (binding) => (binding?.classStableId === CLASS_ID ? CATALOG : null),
      resolveStaticFieldAddress: () => null,
      resolveMemberValues: () => undefined,
      ensureOverlayLoaded: (_classStableId: StableId) => undefined,
      ensureInstanceFieldsLoaded: (_classStableId: StableId, _instanceAddress: string) => undefined,
    },
    expressions: {
      resolveSource: (source, snapshots) => resolveExpressionSource(source, { snapshots }),
    },
  };
}

function createContext(): StudioNodeQueryContext {
  const nodes: StudioNode[] = [
    {
      id: 'class-1',
      type: 'class-ref',
      position: { x: 0, y: 0 },
      data: {
        binding: BINDING,
        instanceSource: createLiteralExpressionSource('0x1234', 'address'),
        infoSelection: { members: [], statics: [], functions: [METHOD_MOVE] },
      },
    },
    {
      id: 'call-1',
      type: 'call-function',
      position: { x: 240, y: 0 },
      data: {
        selectedMethodStableId: METHOD_MOVE,
        arguments: [
          { id: 'binding:x' as StableId, name: 'x', source: createLiteralExpressionSource('1.5', 'number') },
          { id: 'binding:y' as StableId, name: 'y', source: createLiteralExpressionSource('2.5', 'number') },
        ],
      },
    },
  ];

  const edges: StudioEdge[] = [{
    id: 'edge-class-call',
    channel: 'data',
    sourceNodeId: 'class-1',
    sourcePortId: 'info-out',
    targetNodeId: 'call-1',
    targetPortId: 'class-info-in',
  }];

  return {
    nodes,
    edges,
    nodeSnapshots: {},
    runtimeData: createRuntimeData(),
  };
}

describe('nodeQueryService', () => {
  beforeEach(() => {
    initializeStudioNodeRegistry(studioNodeCatalog);
  });

  afterEach(() => {
    initializeStudioNodeRegistry([]);
  });

  it('materializes upstream class info payloads for call-function editor queries', () => {
    const classInfo = getConnectedClassInfoPayload('call-1', createContext());

    expect(classInfo).toMatchObject({
      basic: {
        className: 'PlayerController',
      },
      instanceAddress: '0x1234',
      functions: [{
        name: 'Move',
        runtimeRef: {
          methodStableId: METHOD_MOVE,
        },
      }],
    });
  });

  it('builds call-function output previews from the same materialized class payload', () => {
    const outputs = getNodeOutputPreview('call-1', createContext());

    expect(outputs?.['result-out']?.payload).toMatchObject({
      method: {
        name: 'Move',
        runtimeRef: {
          methodStableId: METHOD_MOVE,
        },
      },
      instanceAddress: '0x1234',
      arguments: [
        { name: 'x', value: 1.5 },
        { name: 'y', value: 2.5 },
      ],
      success: false,
      result: null,
    });
    expect(outputs?.['instance-ref-out']?.payload).toMatchObject({
      address: null,
      sourceKind: 'call-function-result',
    });
  });

  it('assigns canonical materialized metadata to node-owned query snapshots', () => {
    const snapshot = getNodeQuerySnapshot('call-1', createContext());

    expect(snapshot).toMatchObject({
      nodeId: 'call-1',
      status: 'success',
      originKind: 'materialized',
      phase: 'materialize',
    });
    expect(typeof snapshot?.queryRevision).toBe('number');
  });

  it('uses upstream instance references when materializing a downstream class node preview', () => {
    const context = createContext();
    context.nodes.push({
      id: 'class-2',
      type: 'class-ref',
      position: { x: 480, y: 0 },
      data: {
        binding: BINDING,
        instanceSource: null,
        infoSelection: { members: [], statics: [], functions: [METHOD_MOVE] },
      },
    });
    context.edges.push({
      id: 'edge-call-class-instance',
      channel: 'data',
      sourceNodeId: 'call-1',
      sourcePortId: 'instance-ref-out',
      targetNodeId: 'class-2',
      targetPortId: 'instance-in',
    });
    context.nodeSnapshots['call-1'] = {
      nodeId: 'call-1',
      status: 'success',
      originKind: 'runtime',
      phase: 'execute',
      inputs: {},
      outputs: {
        'instance-ref-out': {
          kind: 'json',
          schema: { id: 'studio.instance.reference', version: 1 },
          payload: {
            address: '244190ab960',
            sourceKind: 'call-function-result',
            runtimeTypeHint: 'Gameplay.PlayerController',
            displayName: 'CreatePlayer result',
          },
        },
      },
      timing: {},
    };

    const outputs = getNodeOutputPreview('class-2', context);

    expect(outputs?.['info-out']?.payload).toMatchObject({
      instanceAddress: '0x244190AB960',
    });
  });

  it('returns diagnostics when incoming data is connected to the wrong target port', () => {
    const context = createContext();
    context.edges = [{
      id: 'edge-class-call-wrong-port',
      channel: 'data',
      sourceNodeId: 'class-1',
      sourcePortId: 'info-out',
      targetNodeId: 'call-1',
      targetPortId: 'legacy-class-info',
    }];

    const queryState = getNodeQueryState<CallFunctionClassInfoQueryState>('call-1', context);

    expect(queryState?.payload).toBeNull();
    expect(queryState?.issues[0]).toMatchObject({
      code: 'query.call-function.port-mismatch',
      targetPortId: 'class-info-in',
    });
  });

  it('derives input bindings by target port instead of all incoming edges', () => {
    const inputStates = getNodeInputBindingStates('call-1', createContext());

    expect(inputStates).toHaveLength(2);
    expect(inputStates[0]).toMatchObject({
      port: { id: 'flow-in' },
      sources: [],
    });
    expect(inputStates[1]).toMatchObject({
      port: { id: 'class-info-in' },
    });
    expect(inputStates[1]?.sources[0]).toMatchObject({
      payload: expect.objectContaining({
        functions: expect.any(Array),
      }),
    });
  });

  it('ignores edges whose channel does not match the target port channel', () => {
    const context = createContext();
    context.edges = [
      ...context.edges,
      {
        id: 'edge-wrong-channel',
        channel: 'control',
        sourceNodeId: 'class-1',
        sourcePortId: 'info-out',
        targetNodeId: 'call-1',
        targetPortId: 'class-info-in',
      },
    ];

    const inputStates = getNodeInputBindingStates('call-1', context);

    expect(inputStates[1]?.sources).toHaveLength(1);
    expect(inputStates[1]?.sources[0]?.edge.id).toBe('edge-class-call');
  });
});