import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createInputExpressionSource, createLiteralExpressionSource, resolveExpressionSource } from './expression';
import { getConnectedClassInfoPayload, getNodeInputBindingStates, getNodeOutputPreview, getNodePreviewCapability, getNodeQuerySnapshot, getNodeQueryState, type StudioNodeQueryContext } from '../../application/studio/query/nodeQueryService';
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
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController' });
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

  it('reports explicit preview capability from node manifests', () => {
    expect(getNodePreviewCapability('class-1', createContext())).toBe('supported');
    expect(getNodePreviewCapability('call-1', createContext())).toBe('degraded');
  });

  it('does not expose output previews for execute-only nodes', () => {
    const context = createContext();
    context.nodes.push({
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 0, y: 240 },
      data: {},
    });

    expect(getNodePreviewCapability('trigger-1', context)).toBe('execute-only');
    expect(getNodeOutputPreview('trigger-1', context)).toBeNull();
    expect(getNodeQuerySnapshot('trigger-1', context)).toBeNull();
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

  it('builds display node preview state from an upstream materialized envelope', () => {
    const context = createContext();
    context.nodes.push({
      id: 'display-1',
      type: 'display',
      position: { x: 480, y: 0 },
      data: {
        selectedFields: [{
          id: 'selected-method-name',
          label: 'Method Name',
          pathTokens: ['method', 'name'],
          pathText: 'method.name',
        }],
      },
    });
    context.edges.push({
      id: 'edge-call-display',
      channel: 'data',
      sourceNodeId: 'call-1',
      sourcePortId: 'result-out',
      targetNodeId: 'display-1',
      targetPortId: 'payload-in',
    });

    const queryState = getNodeQueryState<any>('display-1', context);

    expect(queryState).toMatchObject({
      kind: 'resolved',
      sourceKind: 'preview',
      sourceNodeId: 'call-1',
      sourcePortId: 'result-out',
      envelope: {
        payload: {
          method: {
            name: 'Move',
          },
          success: false,
        },
      },
      selectedFields: [{
        label: 'Method Name',
        pathText: 'method.name',
        resolved: true,
        valueKind: 'primitive',
        value: 'Move',
      }],
    });
    expect(queryState.availableFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ pathText: 'method', valueKind: 'object' }),
      expect.objectContaining({ pathText: 'success', valueKind: 'primitive' }),
    ]));
  });

  it('prefers runtime snapshots over preview output for downstream display consumers', () => {
    const context = createContext();
    context.nodes.push({
      id: 'display-1',
      type: 'display',
      position: { x: 480, y: 0 },
      data: {
        selectedFields: [],
      },
    });
    context.edges.push({
      id: 'edge-call-display',
      channel: 'data',
      sourceNodeId: 'call-1',
      sourcePortId: 'result-out',
      targetNodeId: 'display-1',
      targetPortId: 'payload-in',
    });
    context.nodeSnapshots['display-1'] = {
      nodeId: 'display-1',
      status: 'success',
      originKind: 'runtime',
      phase: 'execute',
      inputs: {
        'payload-in': [{
          kind: 'json',
          schema: { id: 'studio.call-function.result', version: 1 },
          payload: {
            success: true,
            failureKind: 'none',
            error: null,
            exception: null,
            method: { name: 'Move' },
            instanceAddress: '0x1234',
            arguments: [],
            result: null,
          },
        }],
      },
      outputs: {},
      timing: {},
    };

    const snapshot = getNodeQuerySnapshot('display-1', context);

    expect(snapshot).toMatchObject({
      originKind: 'runtime',
      inputs: {
        'payload-in': [{
          payload: {
            success: true,
          },
        }],
      },
    });
  });

  it('stops query materialization cleanly when preview dependencies form a cycle', () => {
    const context = createContext();
    context.nodes = [
      {
        id: 'call-a',
        type: 'call-function',
        position: { x: 0, y: 0 },
        data: {
          selectedMethodStableId: METHOD_MOVE,
          arguments: [],
        },
      },
      {
        id: 'call-b',
        type: 'call-function',
        position: { x: 240, y: 0 },
        data: {
          selectedMethodStableId: METHOD_MOVE,
          arguments: [],
        },
      },
    ];
    context.edges = [
      {
        id: 'edge-a-b',
        channel: 'data',
        sourceNodeId: 'call-a',
        sourcePortId: 'result-out',
        targetNodeId: 'call-b',
        targetPortId: 'class-info-in',
      },
      {
        id: 'edge-b-a',
        channel: 'data',
        sourceNodeId: 'call-b',
        sourcePortId: 'result-out',
        targetNodeId: 'call-a',
        targetPortId: 'class-info-in',
      },
    ];

    expect(getNodeQuerySnapshot('call-a', context)).toBeNull();
    expect(getNodeOutputPreview('call-a', context)).toBeNull();
  });
});