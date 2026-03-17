import { describe, expect, it } from 'vitest';
import type { ClassInfo } from '../../types';
import {
  buildStudioClassCatalog,
  createClassInfoCatalogFromClassInfo,
  createPendingClassNodeRequest,
  filterStudioClassCatalog,
  reconcileClassInfoSelection,
} from './classCatalog';

const sampleClassInfo: ClassInfo = {
  id: 'player-controller',
  name: 'PlayerController',
  namespace: 'Gameplay',
  full_name: 'Gameplay.PlayerController',
  inheritance: [],
  static_fields: [
    { name: 'Instance', field_type: 'Gameplay.PlayerController', address: '0x1000', value: 'null' },
  ],
  fields: [
    { offset: '10', name: 'health', field_type: 'System.Int32' },
    { offset: '14', name: 'speed', field_type: 'System.Single' },
  ],
  methods: [
    { name: 'Move', signature: 'System.Void Move(System.Single x, System.Single y)' },
  ],
};

describe('classCatalog', () => {
  it('builds a searchable class catalog sorted by assembly and namespace', () => {
    const entries = buildStudioClassCatalog(
      [
        { id: 'img-b', name: 'Zeta.dll', path: 'Zeta.dll' },
        { id: 'img-a', name: 'Assembly-CSharp.dll', path: 'Assembly-CSharp.dll' },
      ],
      {
        'img-b': [{ id: 'enemy', name: 'Enemy', namespace: 'Gameplay', full_name: 'Gameplay.Enemy' }],
        'img-a': [
          { id: 'hud', name: 'Hud', namespace: 'Ui', full_name: 'Ui.Hud' },
          { id: 'player', name: 'PlayerController', namespace: 'Gameplay', full_name: 'Gameplay.PlayerController' },
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
      [{ id: 'img-a', name: 'Assembly-CSharp.dll', path: 'Assembly-CSharp.dll' }],
      {
        'img-a': [
          { id: 'player', name: 'PlayerController', namespace: 'Gameplay', full_name: 'Gameplay.PlayerController' },
          { id: 'camera', name: 'CameraRig', namespace: 'Cinematics', full_name: 'Cinematics.CameraRig' },
        ],
      },
    );

    expect(filterStudioClassCatalog(entries, 'camera')).toHaveLength(1);
    expect(filterStudioClassCatalog(entries, 'ASSEMBLY-CSHARP')).toHaveLength(2);
  });

  it('reconciles selection ids against the latest class info catalog', () => {
    const catalog = createClassInfoCatalogFromClassInfo(sampleClassInfo);

    const reconciled = reconcileClassInfoSelection(
      {
        members: ['member:health', 'member:missing'],
        statics: ['static:Instance'],
        functions: ['function:System.Void Missing()'],
      },
      catalog,
    );

    expect(reconciled).toEqual({
      members: ['member:health'],
      statics: ['static:Instance'],
      functions: [],
    });
  });

  it('creates a pending class node request from a concrete binding and class info', () => {
    const request = createPendingClassNodeRequest(
      {
        imageId: 'img-a',
        classId: 'player-controller',
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      sampleClassInfo,
      { x: 320, y: 240 },
    );

    expect(request.requestId).toContain('img-a::player-controller::');
    expect(request.suggestedPosition).toEqual({ x: 320, y: 240 });
    expect(request.availableInfo.members.map((item) => item.id)).toEqual(['member:health', 'member:speed']);
    expect(request.availableInfo.functions[0]?.detail).toContain('Move');
  });
});