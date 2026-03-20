import { describe, expect, it } from 'vitest';
import type { ClassDescriptor, RuntimeClassOverlayDescriptor } from '../analysis/contracts';
import {
  createClassStableId,
  createFieldStableId,
  createImageStableId,
  createMethodStableId,
} from '../contracts/shared-identity';
import {
  buildStudioClassCatalog,
  createClassInfoCatalogFromClassDescriptor,
  createPendingClassNodeRequest,
  createEmptyClassInfoSelection,
  filterStudioClassCatalog,
  normalizeClassInfoCatalog,
  reconcileClassInfoSelection,
} from './editor';

const IMAGE_A = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const IMAGE_B = createImageStableId({ imageName: 'Zeta.dll', imagePath: 'Zeta.dll' });
const CLASS_PLAYER = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Gameplay', className: 'PlayerController', legacyClassId: 'player' });
const CLASS_HUD = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Ui', className: 'Hud', legacyClassId: 'hud' });
const CLASS_ENEMY = createClassStableId({ imageStableId: IMAGE_B, namespace: 'Gameplay', className: 'Enemy', legacyClassId: 'enemy' });
const FIELD_HEALTH = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'health', fieldType: 'System.Int32', fieldKind: 'instance' });
const FIELD_SPEED = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'speed', fieldType: 'System.Single', fieldKind: 'instance' });
const STATIC_INSTANCE = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'Instance', fieldType: 'Gameplay.PlayerController', fieldKind: 'static' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_PLAYER, methodName: 'Move', signature: 'System.Void (System.Single x, System.Single y)' });
const METHOD_MISSING = createMethodStableId({ classStableId: CLASS_PLAYER, methodName: 'Missing', signature: 'System.Void ()' });
const STATIC_RUNTIME_MESSAGE = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'objectIsNullMessage', fieldType: 'System.String', fieldKind: 'static' });
const FIELD_RUNTIME_CACHED_PTR = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'm_CachedPtr', fieldType: 'System.IntPtr', fieldKind: 'instance' });

const sampleClassDescriptor: ClassDescriptor = {
  stableId: CLASS_PLAYER,
  legacyClassId: 'player-controller',
  legacyImageId: 'img-a',
  imageStableId: IMAGE_A,
  name: 'PlayerController',
  namespace: 'Gameplay',
  fullName: 'Gameplay.PlayerController',
  inheritance: [],
  staticFields: [
    { stableId: STATIC_INSTANCE, name: 'Instance', legacyFieldName: 'Instance', fieldType: 'Gameplay.PlayerController', offset: null, address: '0x1000', value: 'null' },
  ],
  fields: [
    { stableId: FIELD_HEALTH, offset: '10', name: 'health', legacyFieldName: 'health', fieldType: 'System.Int32' },
    { stableId: FIELD_SPEED, offset: '14', name: 'speed', legacyFieldName: 'speed', fieldType: 'System.Single' },
  ],
  methods: [
    {
      stableId: METHOD_MOVE,
      name: 'Move',
      signature: 'System.Void (System.Single x, System.Single y)',
      returnType: 'System.Void',
      parameters: [
        { position: 0, name: 'x', typeName: 'System.Single' },
        { position: 1, name: 'y', typeName: 'System.Single' },
      ],
      isStatic: false,
      tags: [],
    },
  ],
};

const sampleRuntimeOverlay: RuntimeClassOverlayDescriptor = {
  classStableId: CLASS_PLAYER,
  staticFields: [
    { stableId: STATIC_RUNTIME_MESSAGE, name: 'objectIsNullMessage', legacyFieldName: 'objectIsNullMessage', fieldType: 'System.String', offset: null, address: '0x2000', value: '?' },
    { stableId: STATIC_INSTANCE, name: 'Instance', legacyFieldName: 'Instance', fieldType: 'Gameplay.PlayerController', offset: null, address: '0x1000', value: '0x1234' },
  ],
  fields: [
    { stableId: FIELD_RUNTIME_CACHED_PTR, offset: '0x10', name: 'm_CachedPtr', legacyFieldName: 'm_CachedPtr', fieldType: 'System.IntPtr' },
    { stableId: FIELD_HEALTH, offset: '10', name: 'health', legacyFieldName: 'health', fieldType: 'System.Int32' },
  ],
};

describe('studio editor catalog', () => {
  it('creates an empty info selection', () => {
    expect(createEmptyClassInfoSelection()).toEqual({ members: [], statics: [], functions: [] });
  });

  it('builds a searchable class catalog sorted by assembly and namespace', () => {
    const entries = buildStudioClassCatalog(
      [
        { stableId: IMAGE_B, legacyImageId: 'img-b', name: 'Zeta.dll', path: 'Zeta.dll' },
        { stableId: IMAGE_A, legacyImageId: 'img-a', name: 'Assembly-CSharp.dll', path: 'Assembly-CSharp.dll' },
      ],
      {
        [IMAGE_B]: [{ stableId: CLASS_ENEMY, imageStableId: IMAGE_B, legacyImageId: 'img-b', legacyClassId: 'enemy', name: 'Enemy', namespace: 'Gameplay', fullName: 'Gameplay.Enemy', imageName: 'Zeta.dll' }],
        [IMAGE_A]: [
          { stableId: CLASS_HUD, imageStableId: IMAGE_A, legacyImageId: 'img-a', legacyClassId: 'hud', name: 'Hud', namespace: 'Ui', fullName: 'Ui.Hud', imageName: 'Assembly-CSharp.dll' },
          { stableId: CLASS_PLAYER, imageStableId: IMAGE_A, legacyImageId: 'img-a', legacyClassId: 'player', name: 'PlayerController', namespace: 'Gameplay', fullName: 'Gameplay.PlayerController', imageName: 'Assembly-CSharp.dll' },
        ],
      },
    );

    expect(entries.map((entry) => entry.fullName)).toEqual([
      'Gameplay.PlayerController',
      'Ui.Hud',
      'Gameplay.Enemy',
    ]);
    expect(entries[0]?.searchText).toContain('assembly-csharp.dll');
  });

  it('filters class catalog entries case-insensitively', () => {
    const entries = buildStudioClassCatalog(
      [{ stableId: IMAGE_A, legacyImageId: 'img-a', name: 'Assembly-CSharp.dll', path: 'Assembly-CSharp.dll' }],
      {
        [IMAGE_A]: [
          { stableId: CLASS_PLAYER, imageStableId: IMAGE_A, legacyImageId: 'img-a', legacyClassId: 'player', name: 'PlayerController', namespace: 'Gameplay', fullName: 'Gameplay.PlayerController', imageName: 'Assembly-CSharp.dll' },
          {
            stableId: createClassStableId({ imageStableId: IMAGE_A, namespace: 'Cinematics', className: 'CameraRig', legacyClassId: 'camera' }),
            imageStableId: IMAGE_A,
            legacyImageId: 'img-a',
            legacyClassId: 'camera',
            name: 'CameraRig',
            namespace: 'Cinematics',
            fullName: 'Cinematics.CameraRig',
            imageName: 'Assembly-CSharp.dll',
          },
        ],
      },
    );

    expect(filterStudioClassCatalog(entries, 'camera')).toHaveLength(1);
    expect(filterStudioClassCatalog(entries, 'ASSEMBLY-CSHARP')).toHaveLength(2);
  });

  it('reconciles selection ids against the latest class info catalog', () => {
    const catalog = createClassInfoCatalogFromClassDescriptor(sampleClassDescriptor);

    const reconciled = reconcileClassInfoSelection(
      {
        members: [FIELD_HEALTH, createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'missing', fieldType: 'System.Int32', fieldKind: 'instance' })],
        statics: [STATIC_INSTANCE],
        functions: [METHOD_MISSING],
      },
      catalog,
    );

    expect(reconciled).toEqual({
      members: [FIELD_HEALTH],
      statics: [STATIC_INSTANCE],
      functions: [],
    });
  });

  it('prefers runtime overlay members and statics when building a class info catalog', () => {
    const catalog = createClassInfoCatalogFromClassDescriptor(sampleClassDescriptor, sampleRuntimeOverlay);

    expect(catalog.statics.map((item) => item.id)).toEqual([STATIC_RUNTIME_MESSAGE, STATIC_INSTANCE]);
    expect(catalog.members.map((item) => item.id)).toEqual([FIELD_RUNTIME_CACHED_PTR, FIELD_HEALTH]);
    expect(catalog.statics[1]?.address).toBe('0x1000');
  });

  it('creates a pending class node request from a concrete binding', () => {
    const request = createPendingClassNodeRequest(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      { x: 320, y: 240 },
    );

    expect(request.requestId).toContain(`${IMAGE_A}::${CLASS_PLAYER}::`);
    expect(request.suggestedPosition).toEqual({ x: 320, y: 240 });
    expect(request.binding).toEqual({
      imageStableId: IMAGE_A,
      classStableId: CLASS_PLAYER,
      fullName: 'Gameplay.PlayerController',
      name: 'PlayerController',
      namespace: 'Gameplay',
      imageName: 'Assembly-CSharp.dll',
    });
  });

  it('normalizes malformed class info catalogs from persisted data', () => {
    const catalog = normalizeClassInfoCatalog({
      members: [
        { id: FIELD_HEALTH, label: 'health', name: 'health', legacyFieldName: 'health', typeName: 'System.Int32', offset: '0x10', address: null, value: null, isStatic: false },
        { id: 123 },
      ],
      statics: 'invalid',
      functions: [{
        id: METHOD_MOVE,
        label: 'Move',
        name: 'Move',
        signature: 'System.Void ()',
        returnType: 'System.Void',
        isStatic: false,
        tags: ['public', 42],
      }],
    });

    expect(catalog.members).toHaveLength(1);
    expect(catalog.statics).toEqual([]);
    expect(catalog.functions).toEqual([{
      id: METHOD_MOVE,
      label: 'Move',
      name: 'Move',
      signature: 'System.Void ()',
      returnType: 'System.Void',
      parameters: [],
      isStatic: false,
      tags: ['public'],
      detail: undefined,
    }]);
  });
});