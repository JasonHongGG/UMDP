import { describe, expect, it } from 'vitest';
import { createLiteralExpressionSource } from '@/features/studio/core/expression';
import {
  createClassStableId,
  createImageStableId,
  createMethodStableId,
} from '@/domain/contracts/shared-identity';
import type { ClassInfoPayload } from '@/domain/studio/contracts';
import {
  findSelectedFunction,
  getClassInfoPayloadFromValue,
  reconcileCallFunctionArguments,
  toRuntimeInvokeArgument,
} from './callFunctionNodeModel';

const IMAGE_ID = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_ID, methodName: 'Move', signature: 'System.Void (System.Single x, System.Single y)' });

const SAMPLE_CLASS_INFO: ClassInfoPayload = {
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
    signature: 'System.Void (System.Single x, System.Single y)',
    returnType: 'System.Void',
    parameters: [
      { position: 0, name: 'x', typeName: 'System.Single' },
      { position: 1, name: 'y', typeName: 'System.Single' },
    ],
    isStatic: false,
    runtimeRef: {
      imageStableId: IMAGE_ID,
      classStableId: CLASS_ID,
      methodStableId: METHOD_MOVE,
    },
  }],
};

describe('callFunctionNodeModel', () => {
  it('accepts a valid class info payload and resolves the selected method', () => {
    const payload = getClassInfoPayloadFromValue(SAMPLE_CLASS_INFO);

    expect(payload).toEqual(SAMPLE_CLASS_INFO);
    expect(findSelectedFunction(payload, METHOD_MOVE)).toMatchObject({
      name: 'Move',
      signature: 'System.Void (System.Single x, System.Single y)',
    });
  });

  it('reconciles argument entries against the latest method parameters while preserving existing sources', () => {
    const reconciled = reconcileCallFunctionArguments(
      'node-1',
      METHOD_MOVE,
      SAMPLE_CLASS_INFO.functions[0]!.parameters,
      [{
        id: 'binding:node-1|Move|x' as ReturnType<typeof createMethodStableId>,
        name: 'x',
        source: createLiteralExpressionSource('42'),
      }],
    );

    expect(reconciled).toHaveLength(2);
    expect(reconciled[0]).toMatchObject({ name: 'x', source: createLiteralExpressionSource('42') });
    expect(reconciled[1]?.name).toBe('y');
    expect(reconciled[1]?.source).toEqual(createLiteralExpressionSource(''));
  });

  it('normalizes runtime invocation arguments for primitive and string values', () => {
    expect(toRuntimeInvokeArgument('flag', 'System.Boolean', true)).toEqual({
      name: 'flag',
      typeName: 'System.Boolean',
      valueKind: 'boolean',
      value: 'true',
    });

    expect(toRuntimeInvokeArgument('speed', 'System.Single', 1.5)).toEqual({
      name: 'speed',
      typeName: 'System.Single',
      valueKind: 'number',
      value: '1.5',
    });

    expect(toRuntimeInvokeArgument('label', 'System.String', 'player')).toEqual({
      name: 'label',
      typeName: 'System.String',
      valueKind: 'string',
      value: 'player',
    });
  });
});