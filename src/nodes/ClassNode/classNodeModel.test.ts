import { describe, expect, it } from 'vitest';
import ClassNodeDef from './ClassNode';
import { createClassStableId, createFieldStableId, createImageStableId, createMethodStableId } from '../../domain/contracts/shared-identity';
import { createLiteralExpressionSource } from '../../core/studio/expression';
import type { NodeInstance } from '../../domain/studio/contracts';
import { parseClassNodeDataFromDocumentState } from './classNodeModel';

const IMAGE_A = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_PLAYER = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Gameplay', className: 'PlayerController', legacyClassId: 'player' });
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
          legacyFieldName: 'health',
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
    });

    expect(issues).toMatchObject([
      {
        code: 'class.instance.required',
        target: 'instance-in',
      },
    ]);
  });
});