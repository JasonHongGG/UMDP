import { describe, expect, it } from 'vitest';
import ClassNodeDef from './ClassNode';
import { createClassStableId, createFieldStableId, createImageStableId, createMethodStableId } from '@/domain/contracts/shared-identity';
import { createInputExpressionSource, createLiteralExpressionSource } from '@/features/studio/core/expression';
import type { NodeInstance } from '@/domain/studio/contracts';
import { parseClassNodeDataFromDocumentState } from './classNodeModel';

const EXECUTION_RUNTIME_EXTRAS = {
  abortSignal: null,
  runtimeState: {},
  reportProgress: () => undefined,
};

const IMAGE_A = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_PLAYER = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Gameplay', className: 'PlayerController' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_PLAYER, methodName: 'Move', signature: 'System.Void ()' });
const MEMBER_HEALTH = createFieldStableId({
  classStableId: CLASS_PLAYER,
  fieldKind: 'instance',
  fieldName: 'health',
  fieldType: 'System.Int32',
});

describe('classNodeModel', () => {
  it('hydrates binding and export selection without reading legacy availableInfo', () => {
    const instance: NodeInstance = {
      id: 'node-1',
      nodeType: 'class-ref',
      typeVersion: 1,
      position: { x: 0, y: 0 },
      displayName: 'PlayerController',
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [],
          staticStableIds: [],
          methodStableIds: [METHOD_MOVE],
        },
        availableInfo: {
          members: [],
          statics: [],
          functions: [{
            id: METHOD_MOVE,
            label: 'Move',
            name: 'Move',
            signature: 'System.Void ()',
            returnType: 'System.Void',
            isStatic: false,
            tags: ['public'],
          }],
        },
      },
    };

    const data = parseClassNodeDataFromDocumentState({}, instance);

    expect(data.binding?.classStableId).toBe(CLASS_PLAYER);
    expect(data.infoSelection.functions).toEqual([METHOD_MOVE]);
    expect('availableInfo' in data).toBe(false);
  });

  it('does not require an instance when exporting functions only', () => {
    const issues = ClassNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'class-1',
      nodeType: 'class-ref',
      parameters: {},
      bindings: { instanceSource: createLiteralExpressionSource('', 'string') },
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [],
          staticStableIds: [],
          methodStableIds: [METHOD_MOVE],
        },
      },
      inputBindings: {},
      resolvedBindings: { instanceSource: null },
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => ({
        members: [],
        statics: [],
        functions: [{
          id: METHOD_MOVE,
          label: 'Move',
          name: 'Move',
          signature: 'System.Void ()',
          returnType: 'System.Void',
          parameters: [],
          isStatic: false,
          tags: [],
        }],
      }),
      ...EXECUTION_RUNTIME_EXTRAS,
    });

    expect(issues).toEqual([]);
  });

  it('requires an instance when exporting runtime members', () => {
    const issues = ClassNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'class-1',
      nodeType: 'class-ref',
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [MEMBER_HEALTH],
          staticStableIds: [],
          methodStableIds: [],
        },
      },
      inputBindings: {},
      resolvedBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => ({
        members: [{
          id: MEMBER_HEALTH,
          label: 'health',
          name: 'health',
          typeName: 'System.Int32',
          offset: '0x10',
          address: null,
          value: null,
          isStatic: false,
          tags: [],
        }],
        statics: [],
        functions: [],
      }),
      ...EXECUTION_RUNTIME_EXTRAS,
    });

    expect(issues).toMatchObject([
      {
        code: 'class.instance.required',
        target: 'instance-in',
      },
    ]);
  });

  it('accepts canonical instance references from the instance input port', () => {
    const issues = ClassNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'class-1',
      nodeType: 'class-ref',
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [MEMBER_HEALTH],
          staticStableIds: [],
          methodStableIds: [],
        },
      },
      inputBindings: {
        'instance-in': [createInputExpressionSource('call-1', 'instance-ref-out', [], 'call-1.instance-ref-out')],
      },
      resolvedBindings: {},
      resolvedInputs: {
        'instance-in': [{
          address: '0x1234',
          sourceKind: 'call-function-result',
          runtimeTypeHint: 'Gameplay.PlayerController',
          displayName: 'CreatePlayer result',
        }],
      },
      controlInputs: [],
      getClassInfoCatalogByBinding: () => ({
        members: [{
          id: MEMBER_HEALTH,
          label: 'health',
          name: 'health',
          typeName: 'System.Int32',
          offset: '0x10',
          address: null,
          value: null,
          isStatic: false,
          tags: [],
        }],
        statics: [],
        functions: [],
      }),
      ...EXECUTION_RUNTIME_EXTRAS,
    });

    expect(issues).toEqual([]);
  });

  it('accepts projected instance references from a class info payload on the instance input port', () => {
    const unitPropertyMember = createFieldStableId({
      classStableId: CLASS_PLAYER,
      fieldKind: 'instance',
      fieldName: 'unitProperty',
      fieldType: 'Gameplay.UnitProperty',
    });

    const issues = ClassNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'class-1',
      nodeType: 'class-ref',
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [MEMBER_HEALTH],
          staticStableIds: [],
          methodStableIds: [],
        },
      },
      inputBindings: {
        'instance-in': [createInputExpressionSource('class-upstream', 'info-out', [], 'class-upstream.info-out')],
      },
      resolvedBindings: {},
      resolvedInputs: {
        'instance-in': [{
          basic: {
            imageName: 'Assembly-CSharp.dll',
            className: 'PlayerController',
            namespace: 'Gameplay',
            fullName: 'Gameplay.PlayerController',
          },
          instanceAddress: '0x1234',
          statics: [],
          members: [{
            runtimeRef: {
              imageStableId: IMAGE_A,
              classStableId: CLASS_PLAYER,
              memberStableId: unitPropertyMember,
            },
            name: 'unitProperty',
            typeName: 'Gameplay.UnitProperty',
            offset: '0x20',
            address: '0x1254',
            value: '0x244190AB960',
            isStatic: false,
          }],
          functions: [],
        }],
      },
      controlInputs: [],
      getClassInfoCatalogByBinding: () => ({
        members: [{
          id: MEMBER_HEALTH,
          label: 'health',
          name: 'health',
          typeName: 'System.Int32',
          offset: '0x10',
          address: null,
          value: null,
          isStatic: false,
          tags: [],
        }],
        statics: [],
        functions: [],
      }),
      ...EXECUTION_RUNTIME_EXTRAS,
    });

    expect(issues).toEqual([]);
  });

  it('accepts projected instance references from a parameter definition payload on the instance input port', () => {
    const issues = ClassNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'class-1',
      nodeType: 'class-ref',
      parameters: {},
      bindings: {},
      documentState: {
        classBinding: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          fullName: 'Gameplay.PlayerController',
          name: 'PlayerController',
          namespace: 'Gameplay',
          imageName: 'Assembly-CSharp.dll',
        },
        exportSelection: {
          memberStableIds: [MEMBER_HEALTH],
          staticStableIds: [],
          methodStableIds: [],
        },
      },
      inputBindings: {
        'instance-in': [createInputExpressionSource('params-1', 'params-out', [], 'params-1.params-out')],
      },
      resolvedBindings: {},
      resolvedInputs: {
        'instance-in': [{
          playerAddress: {
            type: 'address',
            value: '0x1234',
          },
        }],
      },
      controlInputs: [],
      getClassInfoCatalogByBinding: () => ({
        members: [{
          id: MEMBER_HEALTH,
          label: 'health',
          name: 'health',
          typeName: 'System.Int32',
          offset: '0x10',
          address: null,
          value: null,
          isStatic: false,
          tags: [],
        }],
        statics: [],
        functions: [],
      }),
      ...EXECUTION_RUNTIME_EXTRAS,
    });

    expect(issues).toEqual([]);
  });
});