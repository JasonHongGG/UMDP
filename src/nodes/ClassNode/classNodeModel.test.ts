import { describe, expect, it } from 'vitest';
import { createClassStableId, createImageStableId, createMethodStableId } from '../../domain/contracts/shared-identity';
import type { NodeInstance } from '../../domain/studio/contracts';
import { parseClassNodeDataFromDocumentState } from './classNodeModel';

const IMAGE_A = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_PLAYER = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Gameplay', className: 'PlayerController', legacyClassId: 'player' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_PLAYER, methodName: 'Move', signature: 'System.Void ()' });

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
});