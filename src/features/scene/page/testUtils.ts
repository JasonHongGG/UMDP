import type {
  RuntimeSceneDescriptor,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneResourceState,
  RuntimeSceneTransformSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';

export function createSceneResourceState(overrides: Partial<RuntimeSceneResourceState> = {}): RuntimeSceneResourceState {
  return {
    resourceKind: 'catalog',
    resourceRevision: 0,
    sessionKey: null,
    freshness: 'fresh',
    lastSuccessfulAt: '2026-03-30T00:00:00.000Z',
    isRetainingSnapshot: true,
    errorMessage: null,
    ...overrides,
  };
}

export function createSceneNodeSummary(overrides: Partial<RuntimeSceneNodeSummary> = {}): RuntimeSceneNodeSummary {
  return {
    objectAddress: '0x1000',
    transformAddress: '0x2000',
    parentObjectAddress: null,
    name: 'GameObject',
    activeSelf: true,
    isStatic: false,
    childCount: 0,
    hasChildren: false,
    componentCount: 1,
    layer: 0,
    tag: 'Untagged',
    hideFlags: 'None',
    path: 'GameObject',
    ...overrides,
  };
}

export function createSceneDescriptor(overrides: Partial<RuntimeSceneDescriptor> = {}): RuntimeSceneDescriptor {
  return {
    sceneHandle: 1,
    name: 'SampleScene',
    isLoaded: true,
    kind: 'loaded',
    buildIndex: 0,
    path: 'Assets/Scenes/SampleScene.unity',
    roots: [createSceneNodeSummary()],
    ...overrides,
  };
}

export function createSceneWorkspaceState(overrides: Partial<SceneWorkspaceState> = {}): SceneWorkspaceState {
  return {
    resourceRevision: 0,
    sessionKey: null,
    refreshStatus: 'ready',
    errorMessage: null,
    mutationEpoch: 0,
    lastUpdatedAt: '2026-03-30T00:00:00.000Z',
    resourceState: createSceneResourceState({
      resourceKind: 'catalog',
      resourceRevision: 0,
      sessionKey: null,
      freshness: 'fresh',
      lastSuccessfulAt: '2026-03-30T00:00:00.000Z',
      isRetainingSnapshot: true,
      errorMessage: null,
    }),
    snapshot: {
      generatedAt: '2026-03-30T00:00:00.000Z',
      scenes: [createSceneDescriptor()],
      buildSettingsScenes: [],
    },
    ...overrides,
  };
}

export function createSceneTransformSnapshot(overrides: Partial<RuntimeSceneTransformSnapshot> = {}): RuntimeSceneTransformSnapshot {
  return {
    transformAddress: '0x2000',
    worldPosition: { x: 1, y: 2, z: 3 },
    localPosition: { x: 1, y: 2, z: 3 },
    localRotation: { x: 0, y: 0, z: 0, w: 1 },
    localEulerAngles: { x: 0, y: 0, z: 0 },
    localScale: { x: 1, y: 1, z: 1 },
    parentTransformAddress: null,
    parentObjectAddress: null,
    childCount: 0,
    ...overrides,
  };
}

export function createSceneInspectorSnapshot(
  overrides: Partial<RuntimeSceneObjectInspectorSnapshot> = {},
): RuntimeSceneObjectInspectorSnapshot {
  const object = createSceneNodeSummary();

  return {
    generatedAt: '2026-03-30T00:00:00.000Z',
    sceneHandle: 1,
    sceneName: 'SampleScene',
    sceneKind: 'loaded',
    object,
    parent: null,
    hierarchyPath: [{ objectAddress: object.objectAddress, name: object.name }],
    transform: createSceneTransformSnapshot(),
    children: [],
    components: [],
    ...overrides,
  };
}