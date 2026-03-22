import { beforeEach, describe, expect, it, vi } from 'vitest';
import CallFunctionNodeDef from './CallFunctionNode';
import { createImageStableId, createClassStableId, createMethodStableId, createStableId } from '../../domain/contracts/shared-identity';
import { createLiteralExpressionSource } from '../../core/studio/expression';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const IMAGE_ID = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController' });
const METHOD_ID = createMethodStableId({ classStableId: CLASS_ID, methodName: 'Move', signature: 'System.Void (System.Single x)' });
const ARGUMENT_ID = createStableId('binding', ['call-1', 'x']);

function createExecutionContext(overrides: Partial<Parameters<NonNullable<typeof CallFunctionNodeDef.executionContract>['execute']>[0]> = {}) {
  return {
    documentId: 'doc-1',
    nodeId: 'call-1',
    nodeType: 'call-function',
    parameters: {},
    bindings: {},
    resolvedBindings: {},
    documentState: {
      selectedMethodStableId: METHOD_ID,
      arguments: [{
        stableId: ARGUMENT_ID,
        name: 'x',
        valueSource: createLiteralExpressionSource('1.5', 'number'),
      }],
    },
    inputBindings: {},
    resolvedInputs: {
      'class-info-in': [{
        basic: {
          imageName: 'Assembly-CSharp.dll',
          className: 'PlayerController',
          namespace: 'Gameplay',
          fullName: 'Gameplay.PlayerController',
        },
        instanceAddress: '0x1234',
        statics: [],
        members: [],
        functions: [{
          name: 'Move',
          signature: 'System.Void (System.Single x)',
          returnType: 'System.Void',
          parameters: [{ position: 0, name: 'x', typeName: 'System.Single' }],
          isStatic: false,
          runtimeRef: {
            imageStableId: IMAGE_ID,
            classStableId: CLASS_ID,
            methodStableId: METHOD_ID,
          },
        }],
      }],
    },
    controlInputs: [],
    runtimeState: {},
    getClassInfoCatalogByBinding: () => null,
    abortSignal: null,
    reportProgress: () => undefined,
    ...overrides,
  };
}

describe('CallFunctionNode', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('emits a structured failure result when class info is missing', async () => {
    const result = await CallFunctionNodeDef.executionContract!.execute(createExecutionContext({
      resolvedInputs: {},
    }));

    expect(result.state).toBe('error');
    expect(result.outputs?.['result-out']).toMatchObject({
      payload: {
        method: null,
        success: false,
        error: 'Call Function node requires an incoming Class Info payload.',
      },
    });
    expect(result.outputs?.['instance-ref-out']).toMatchObject({
      payload: {
        address: null,
        sourceKind: 'call-function-result',
      },
    });
  });

  it('emits a structured failure result when the tauri invoke call throws', async () => {
    invokeMock.mockRejectedValueOnce(new Error('bridge offline'));

    const result = await CallFunctionNodeDef.executionContract!.execute(createExecutionContext({
      resolvedBindings: {
        [ARGUMENT_ID]: 1.5,
      },
    }));

    expect(result.state).toBe('error');
    expect(result.outputs?.['result-out']).toMatchObject({
      payload: {
        method: {
          name: 'Move',
        },
        success: false,
        error: 'Failed to invoke method: Error: bridge offline',
        arguments: [{ name: 'x', value: 1.5 }],
      },
    });
    expect(result.outputs?.['instance-ref-out']).toMatchObject({
      payload: {
        address: null,
        sourceKind: 'call-function-result',
      },
    });
  });

  it('projects object return addresses to a dedicated instance-ref output', async () => {
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

    const result = await CallFunctionNodeDef.executionContract!.execute(createExecutionContext({
      resolvedBindings: {
        [ARGUMENT_ID]: 1.5,
      },
    }));

    expect(result.state).toBe('success');
    expect(result.outputs?.['instance-ref-out']).toMatchObject({
      payload: {
        address: '0x244190AB960',
        sourceKind: 'call-function-result',
        runtimeTypeHint: 'System.Void',
        displayName: 'Move result',
      },
    });
  });
});