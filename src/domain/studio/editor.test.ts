import { describe, expect, it } from 'vitest';
import type { ClassDescriptor } from '../analysis/contracts';
import {
  buildStudioClassCatalog,
  createClassInfoCatalogFromClassDescriptor,
  createPendingClassNodeRequest,
  createEmptyClassInfoSelection,
  filterStudioClassCatalog,
  reconcileClassInfoSelection,
} from './editor';

const IMAGE_A = 'image:assembly-csharp' as any;
const IMAGE_B = 'image:zeta' as any;
const CLASS_PLAYER = 'class:player' as any;
const CLASS_HUD = 'class:hud' as any;
const CLASS_ENEMY = 'class:enemy' as any;
const FIELD_HEALTH = 'field:player:health' as any;
const FIELD_SPEED = 'field:player:speed' as any;
const STATIC_INSTANCE = 'field:player:instance' as any;
const METHOD_MOVE = 'method:player:move' as any;
const METHOD_MISSING = 'method:player:missing' as any;

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
    { stableId: METHOD_MOVE, name: 'Move', signature: 'System.Void Move(System.Single x, System.Single y)', tags: [] },
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
          { stableId: 'class:camera' as any, imageStableId: IMAGE_A, legacyImageId: 'img-a', legacyClassId: 'camera', name: 'CameraRig', namespace: 'Cinematics', fullName: 'Cinematics.CameraRig', imageName: 'Assembly-CSharp.dll' },
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
        members: [FIELD_HEALTH, 'field:missing' as any],
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

  it('creates a pending class node request from a concrete binding and canonical info catalog', () => {
    const request = createPendingClassNodeRequest(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      createClassInfoCatalogFromClassDescriptor(sampleClassDescriptor),
      { x: 320, y: 240 },
    );

    expect(request.requestId).toContain('image:assembly-csharp::class:player::');
    expect(request.suggestedPosition).toEqual({ x: 320, y: 240 });
    expect(request.availableInfo.members.map((item) => item.id)).toEqual([FIELD_HEALTH, FIELD_SPEED]);
    expect(request.availableInfo.functions[0]?.detail).toContain('Move');
  });
});