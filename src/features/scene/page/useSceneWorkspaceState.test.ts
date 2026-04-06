// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type {
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectHeaderTaskState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { useSceneWorkspaceState } from './useSceneWorkspaceState';
import { createSceneDescriptor, createSceneNodeSummary, createSceneResourceState, createSceneWorkspaceState } from './testUtils';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let workspaceStateUpdatedHandler: ((state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) | null = null;
let headerTaskUpdatedHandler: ((state: RuntimeSceneObjectHeaderTaskState) => void | Promise<void>) | null = null;
let mousePickerStateUpdatedHandler: ((state: RuntimeSceneMousePickerSnapshot) => void | Promise<void>) | null = null;

vi.mock('@/infrastructure/tauri/TauriSceneEvents', () => ({
  onSceneWorkspaceStateUpdated: vi.fn(async (handler: (state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) => {
    workspaceStateUpdatedHandler = handler;
    return () => {
      workspaceStateUpdatedHandler = null;
    };
  }),
  onSceneObjectChildrenTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
  onSceneObjectHeaderTaskUpdated: vi.fn(async (handler: (state: RuntimeSceneObjectHeaderTaskState) => void | Promise<void>) => {
    headerTaskUpdatedHandler = handler;
    return () => {
      headerTaskUpdatedHandler = null;
    };
  }),
  onSceneObjectComponentsTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
  onSceneMousePickerStateUpdated: vi.fn(async (handler: (state: RuntimeSceneMousePickerSnapshot) => void | Promise<void>) => {
    mousePickerStateUpdatedHandler = handler;
    return () => {
      mousePickerStateUpdatedHandler = null;
    };
  }),
}));

interface HookSnapshot {
  sceneWorkspace: ReturnType<typeof useSceneWorkspaceState>['sceneWorkspace'];
  selectedObjectAddress: ReturnType<typeof useSceneWorkspaceState>['selectedObjectAddress'];
  setSelectedObjectAddress: ReturnType<typeof useSceneWorkspaceState>['setSelectedObjectAddress'];
  setSceneObjectActive: ReturnType<typeof useSceneWorkspaceState>['setSceneObjectActive'];
  openSceneMousePickHit: ReturnType<typeof useSceneWorkspaceState>['openSceneMousePickHit'];
  sceneMousePickerState: ReturnType<typeof useSceneWorkspaceState>['sceneMousePickerState'];
  sceneMutationState: ReturnType<typeof useSceneWorkspaceState>['sceneMutationState'];
  sceneTabs: ReturnType<typeof useSceneWorkspaceState>['sceneTabs'];
  activeSceneTabIndex: ReturnType<typeof useSceneWorkspaceState>['activeSceneTabIndex'];
  sceneRootsByHandle: ReturnType<typeof useSceneWorkspaceState>['sceneRootsByHandle'];
  loadedSceneGraph: ReturnType<typeof useSceneWorkspaceState>['loadedSceneGraph'];
  sceneInspector: ReturnType<typeof useSceneWorkspaceState>['sceneInspector'];
  childrenByParent: ReturnType<typeof useSceneWorkspaceState>['childrenByParent'];
  childTaskByParent: ReturnType<typeof useSceneWorkspaceState>['childTaskByParent'];
  loadingChildrenByParent: ReturnType<typeof useSceneWorkspaceState>['loadingChildrenByParent'];
  sceneInspectorComponentsError: ReturnType<typeof useSceneWorkspaceState>['sceneInspectorComponentsError'];
  ensureSceneObjectChildrenLoaded: ReturnType<typeof useSceneWorkspaceState>['ensureSceneObjectChildrenLoaded'];
  stopSceneObjectChildrenObservation: ReturnType<typeof useSceneWorkspaceState>['stopSceneObjectChildrenObservation'];
}

let latestState: HookSnapshot | null = null;

function createMousePickerState(
  overrides: Partial<RuntimeSceneMousePickerSnapshot> = {},
): RuntimeSceneMousePickerSnapshot {
  return {
    resourceRevision: 0,
    sessionKey: 'session-1',
    status: 'idle',
    statusDetail: null,
    isRunning: false,
    targetWindow: null,
    cursorScreenPosition: null,
    cursorClientPosition: null,
    cursorInsideClient: false,
      hoverHit: null,
      recentHits: [],
    lastUpdatedAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function createSceneMutationResult(
  overrides: Partial<RuntimeSceneMutationResult> = {},
): RuntimeSceneMutationResult {
  const object = createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', activeSelf: true });

  return {
    operation: 'set-active',
    sceneHandle: 7,
    targetObjectAddress: object.objectAddress,
    parentObjectAddress: null,
    object,
    deletedObjectAddress: null,
    preferredSelectionAddress: object.objectAddress,
    preferredSelectionHint: null,
    activeSelf: object.activeSelf,
    tag: null,
    layer: null,
    hideFlags: null,
    behaviourEnabled: null,
    hierarchyPath: [],
    transform: null,
    ...overrides,
  };
}

function createHeaderTaskState(
  overrides: Partial<RuntimeSceneObjectHeaderTaskState> = {},
): RuntimeSceneObjectHeaderTaskState {
  const object = createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', activeSelf: true });

  return {
    taskId: 21,
    resourceRevision: 8,
    sessionKey: 'session-1',
    objectAddress: '0xroot',
    status: 'ready',
    mutationEpoch: 0,
    startedAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:01.000Z',
    header: {
      generatedAt: '2026-03-30T00:00:01.000Z',
      sceneHandle: 7,
      sceneName: 'Gameplay',
      sceneKind: 'loaded',
      object,
      parent: null,
      hierarchyPath: [{ objectAddress: object.objectAddress, name: object.name }],
      transform: null,
    },
    errorMessage: null,
    isStale: false,
    resourceState: createSceneResourceState({
      resourceKind: 'scene-object-header',
      resourceRevision: 8,
      sessionKey: 'session-1',
      freshness: 'fresh',
      isRetainingSnapshot: true,
      snapshotKind: 'fresh',
      errorMessage: null,
    }),
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createLifecycle(
  overrides: Partial<WorkspaceLifecycleState> = {},
  sessionKey = 'session-1',
): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'ready',
    hasSnapshot: true,
    runtime: 'mono',
    ...overrides,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'ready',
      runtime: 'mono',
      connected: true,
      capabilities: [
        'metadata',
        'scene-catalog-read',
        'scene-object-header-read',
        'scene-object-children-read',
      ],
      sessionKey,
      ...overrides.runtimeSession,
    },
  };
}

function createRepository(sessionKey = 'session-1'): SceneGateway {
  const workspace = createSceneWorkspaceState({
    resourceRevision: 4,
    sessionKey,
    snapshot: {
      generatedAt: '2026-03-30T00:00:00.000Z',
      scenes: [{
        sceneHandle: 7,
        name: 'Gameplay',
        isLoaded: true,
        kind: 'loaded',
        buildIndex: 0,
        path: 'Assets/Scenes/Gameplay.unity',
        roots: [createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', isStatic: true })],
      }],
      buildSettingsScenes: [],
    },
  });
  const emptyMousePickerState = createMousePickerState({ sessionKey });

  return {
    getSceneWorkspaceState: vi.fn().mockResolvedValue(workspace),
    startSceneRefresh: vi.fn().mockResolvedValue(workspace),
    listScenePickerWindows: vi.fn().mockResolvedValue([]),
    getSceneMousePickerState: vi.fn().mockResolvedValue(emptyMousePickerState),
    setSceneMousePickerTarget: vi.fn().mockResolvedValue(emptyMousePickerState),
    startSceneMousePicker: vi.fn().mockResolvedValue(emptyMousePickerState),
    stopSceneMousePicker: vi.fn().mockResolvedValue(emptyMousePickerState),
    getSceneObjectChildren: vi.fn().mockResolvedValue({
      generatedAt: '2026-03-30T00:00:00.000Z',
      objectAddress: '0xroot',
      children: [],
      totalCount: 0,
      nextOffset: null,
    }),
    startSceneObjectChildrenAnalysis: vi.fn().mockResolvedValue(null),
    getSceneObjectChildrenState: vi.fn().mockResolvedValue(null),
    startSceneObjectHeaderAnalysis: vi.fn().mockResolvedValue(null),
    getSceneObjectHeaderState: vi.fn().mockResolvedValue(null),
    cancelSceneObjectHeaderAnalysis: vi.fn(),
    startSceneObjectComponentsAnalysis: vi.fn().mockResolvedValue(null),
    getSceneObjectComponentsState: vi.fn().mockResolvedValue(null),
    cancelSceneObjectComponentsAnalysis: vi.fn(),
    cancelSceneObjectChildrenAnalysis: vi.fn(),
    createSceneRoot: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'create-root', targetObjectAddress: null, preferredSelectionAddress: null })),
    createSceneChild: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'create-child' })),
    duplicateSceneObject: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'duplicate' })),
    deleteSceneObject: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'delete', deletedObjectAddress: '0xroot', object: null, preferredSelectionAddress: null, activeSelf: null })),
    renameSceneObject: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'rename' })),
    setSceneObjectTag: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-tag' })),
    setSceneObjectLayer: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-layer' })),
    setSceneObjectHideFlags: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-hide-flags' })),
    reparentSceneObject: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'reparent' })),
    setSceneObjectActive: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-active' })),
    setSceneObjectTransform: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-transform' })),
    setSceneBehaviourEnabled: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'set-behaviour-enabled' })),
    createSceneComponent: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'add-component' })),
    deleteSceneComponent: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'remove-component' })),
    loadSceneByBuildIndex: vi.fn().mockResolvedValue(createSceneMutationResult({ operation: 'load-scene', targetObjectAddress: null, preferredSelectionAddress: null, object: null, activeSelf: null })),
  };
}

function HookHarness({
  repository,
  sessionKey = 'session-1',
  workspaceLifecycle,
}: {
  repository: SceneGateway;
  sessionKey?: string;
  workspaceLifecycle?: WorkspaceLifecycleState;
}) {
  const state = useSceneWorkspaceState({
    repository,
    workspaceLifecycle: workspaceLifecycle ?? createLifecycle({
      processSession: {
        pid: 1337,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: 'C:/Game_Data',
        managedDir: 'C:/Game_Data/Managed',
        runtime: 'mono',
      },
    }, sessionKey),
    active: true,
  });

  latestState = {
    sceneWorkspace: state.sceneWorkspace,
    selectedObjectAddress: state.selectedObjectAddress,
    setSelectedObjectAddress: state.setSelectedObjectAddress,
    setSceneObjectActive: state.setSceneObjectActive,
    openSceneMousePickHit: state.openSceneMousePickHit,
    sceneMousePickerState: state.sceneMousePickerState,
    sceneMutationState: state.sceneMutationState,
    sceneTabs: state.sceneTabs,
    activeSceneTabIndex: state.activeSceneTabIndex,
    sceneRootsByHandle: state.sceneRootsByHandle,
    loadedSceneGraph: state.loadedSceneGraph,
    sceneInspector: state.sceneInspector,
    childrenByParent: state.childrenByParent,
    childTaskByParent: state.childTaskByParent,
    loadingChildrenByParent: state.loadingChildrenByParent,
    sceneInspectorComponentsError: state.sceneInspectorComponentsError,
    ensureSceneObjectChildrenLoaded: state.ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation: state.stopSceneObjectChildrenObservation,
  };

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useSceneWorkspaceState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestState = null;
    workspaceStateUpdatedHandler = null;
    headerTaskUpdatedHandler = null;
    mousePickerStateUpdatedHandler = null;
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('loads the current workspace snapshot and exposes roots by scene handle', async () => {
    const repository = createRepository();

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    expect(repository.getSceneWorkspaceState).toHaveBeenCalled();
    expect(latestState?.sceneWorkspace.snapshot?.scenes[0]?.roots[0]?.isStatic).toBe(true);
    expect(latestState?.sceneRootsByHandle[7]?.[0]?.name).toBe('GameplayRoot');
  });

  it('ignores workspace events from a previous runtime session', async () => {
    const repository = createRepository();

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      await workspaceStateUpdatedHandler?.(createSceneWorkspaceState({
        sessionKey: 'session-stale',
        snapshot: {
          generatedAt: '2026-03-30T00:00:00.000Z',
          scenes: [createSceneDescriptor({
            sceneHandle: 7,
            roots: [createSceneNodeSummary({ objectAddress: '0xstale', name: 'StaleRoot' })],
          })],
          buildSettingsScenes: [],
        },
      }));
    });

    expect(latestState?.sceneRootsByHandle[7]?.[0]?.name).toBe('GameplayRoot');
  });

  it('ignores workspace events from an older revision in the same runtime session', async () => {
    const repository = createRepository();

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      await workspaceStateUpdatedHandler?.(createSceneWorkspaceState({
        resourceRevision: 3,
        sessionKey: 'session-1',
        snapshot: {
          generatedAt: '2026-03-30T00:00:00.000Z',
          scenes: [createSceneDescriptor({
            sceneHandle: 7,
            roots: [createSceneNodeSummary({ objectAddress: '0xolder', name: 'OlderRoot' })],
          })],
          buildSettingsScenes: [],
        },
      }));
    });

    expect(latestState?.sceneWorkspace.resourceRevision).toBe(4);
    expect(latestState?.sceneRootsByHandle[7]?.[0]?.name).toBe('GameplayRoot');
  });

  it('accepts workspace events that advance mutation epoch within the same revision', async () => {
    const repository = createRepository();

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      await workspaceStateUpdatedHandler?.(createSceneWorkspaceState({
        resourceRevision: 4,
        mutationEpoch: 1,
        sessionKey: 'session-1',
        snapshot: {
          generatedAt: '2026-03-30T00:00:00.000Z',
          scenes: [createSceneDescriptor({
            sceneHandle: 7,
            roots: [createSceneNodeSummary({ objectAddress: '0xmutated', name: 'MutatedRoot' })],
          })],
          buildSettingsScenes: [],
        },
      }));
    });

    expect(latestState?.sceneWorkspace.resourceRevision).toBe(4);
    expect(latestState?.sceneWorkspace.mutationEpoch).toBe(1);
    expect(latestState?.sceneRootsByHandle[7]?.[0]?.name).toBe('MutatedRoot');
  });

  it('retains loaded children when observation stops', async () => {
    const repository = createRepository() as unknown as SceneGateway & {
      startSceneObjectChildrenAnalysis: ReturnType<typeof vi.fn>;
    };
    const loadedChild = createSceneNodeSummary({
      objectAddress: '0xchild',
      parentObjectAddress: '0xroot',
      name: 'LoadedChild',
    });
    repository.startSceneObjectChildrenAnalysis = vi.fn().mockResolvedValue({
      taskId: 11,
      resourceRevision: 5,
      sessionKey: 'session-1',
      parentObjectAddress: '0xroot',
      status: 'ready',
      mutationEpoch: 0,
      startedAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      children: [loadedChild],
      totalCount: 1,
      loadedCount: 1,
      nextOffset: null,
      errorMessage: null,
      isStale: false,
      resourceState: createSceneResourceState({
        resourceKind: 'children',
        resourceRevision: 5,
        sessionKey: 'session-1',
        freshness: 'fresh',
      }),
    });

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      await latestState?.ensureSceneObjectChildrenLoaded('0xroot');
    });
    await flushEffects();

    expect(latestState?.childrenByParent['0xroot']?.[0]?.name).toBe('LoadedChild');

    await act(async () => {
      latestState?.stopSceneObjectChildrenObservation('0xroot');
    });
    await flushEffects();

    expect(latestState?.childrenByParent['0xroot']?.[0]?.name).toBe('LoadedChild');
    expect(latestState?.childTaskByParent['0xroot']?.taskId).toBe(11);
  });

  it('stores hover and recent picker hits without auto-opening the inspector', async () => {
    const sessionKey = 'session-picker-open';
    const repository = createRepository(sessionKey);

    await act(async () => {
      root.render(createElement(HookHarness, { repository, sessionKey }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 5,
        sessionKey,
        status: 'observing',
        statusDetail: 'Observing PickedRoot. Recent refreshes automatically. Press Escape to stop.',
        hoverHit: {
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xpick',
          objectName: 'PickedRoot',
          transformAddress: '0xpick-transform',
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: 4.5,
          screenPosition: { x: 400, y: 300 },
          clientPosition: { x: 200, y: 160 },
        },
        recentHits: [{
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xpick',
          objectName: 'PickedRoot',
          transformAddress: '0xpick-transform',
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: 4.5,
          screenPosition: { x: 400, y: 300 },
          clientPosition: { x: 200, y: 160 },
        }],
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(0);
    expect(latestState?.selectedObjectAddress).toBeNull();
    expect(latestState?.sceneMousePickerState.hoverHit?.objectAddress).toBe('0xpick');
    expect(latestState?.sceneMousePickerState.recentHits[0]?.objectAddress).toBe('0xpick');
  });

  it('deduplicates recent picker hits by object address before rendering picker state', async () => {
    const sessionKey = 'session-picker-dedupe';
    const repository = createRepository(sessionKey);

    await act(async () => {
      root.render(createElement(HookHarness, { repository, sessionKey }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 99,
        sessionKey,
        status: 'observing',
        recentHits: [
          {
            observedAt: '2026-03-30T00:00:01.000Z',
            objectAddress: '0xdup',
            objectName: 'Duplicated',
            transformAddress: '0xdup-transform-a',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            hierarchyPath: [],
            distance: 4.5,
            screenPosition: { x: 400, y: 300 },
            clientPosition: { x: 200, y: 160 },
          },
          {
            observedAt: '2026-03-30T00:00:02.000Z',
            objectAddress: '0xdup',
            objectName: 'Duplicated',
            transformAddress: '0xdup-transform-b',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            hierarchyPath: [],
            distance: 4.4,
            screenPosition: { x: 410, y: 310 },
            clientPosition: { x: 210, y: 170 },
          },
          {
            observedAt: '2026-03-30T00:00:03.000Z',
            objectAddress: '0xother',
            objectName: 'Other',
            transformAddress: '0xother-transform',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            hierarchyPath: [],
            distance: 4.3,
            screenPosition: { x: 420, y: 320 },
            clientPosition: { x: 220, y: 180 },
          },
        ],
      }));
    });
    await flushEffects();

    expect(latestState?.sceneMousePickerState.recentHits.map((hit) => hit.objectAddress)).toEqual(['0xdup', '0xother']);
  });

  it('ignores stale mouse picker events from a previous runtime session', async () => {
    const sessionKey = 'session-picker-stale';
    const repository = createRepository(sessionKey);

    await act(async () => {
      root.render(createElement(HookHarness, { repository, sessionKey }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 2,
        sessionKey: 'session-stale',
        hoverHit: {
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xstale-pick',
          objectName: 'StalePick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 20, y: 40 },
          clientPosition: { x: 10, y: 20 },
        },
        recentHits: [{
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xstale-pick',
          objectName: 'StalePick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 20, y: 40 },
          clientPosition: { x: 10, y: 20 },
        }],
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(0);
    expect(latestState?.selectedObjectAddress).toBeNull();
    expect(latestState?.sceneMousePickerState.hoverHit).toBeNull();
  });

  it('keeps components loading local when the session does not support component materialization', async () => {
    sessionStorage.setItem('mndp_scene_selected_address', '0xroot');
    sessionStorage.setItem('mndp_scene_tabs', JSON.stringify([
      {
        objectAddress: '0xroot',
        name: 'GameplayRoot',
        sceneName: 'Gameplay',
        sceneKind: 'loaded',
      },
    ]));
    sessionStorage.setItem('mndp_scene_tab_index', '0');

    const repository = createRepository() as unknown as SceneGateway & {
      startSceneObjectHeaderAnalysis: ReturnType<typeof vi.fn>;
      startSceneObjectChildrenAnalysis: ReturnType<typeof vi.fn>;
      startSceneObjectComponentsAnalysis: ReturnType<typeof vi.fn>;
    };
    const capabilityMessage = 'Component materialization is unavailable for this runtime session.';
    const workspaceLifecycle = createLifecycle({
      processSession: {
        pid: 1337,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: 'C:/Game_Data',
        managedDir: 'C:/Game_Data/Managed',
        runtime: 'mono',
      },
      runtimeSession: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
        status: 'ready',
        runtime: 'mono',
        connected: true,
        sessionKey: 'session-1',
        capabilities: [
          'metadata',
          'scene-catalog-read',
          'scene-object-header-read',
          'scene-object-children-read',
        ],
        sceneObjectComponents: {
          status: 'unsupported',
          strategy: null,
          reason: capabilityMessage,
          checkedAt: '2026-04-06T12:00:00.000Z',
        },
      },
    });

    await act(async () => {
      root.render(createElement(HookHarness, { repository, workspaceLifecycle }));
    });
    await flushEffects();
    await flushEffects();

    expect(repository.startSceneObjectComponentsAnalysis).not.toHaveBeenCalled();
    expect(latestState?.sceneInspectorComponentsError).toBe(capabilityMessage);
  });

  it('ignores older mouse picker revisions from the current runtime session', async () => {
    const sessionKey = 'session-picker-revision';
    const repository = createRepository(sessionKey);

    await act(async () => {
      root.render(createElement(HookHarness, { repository, sessionKey }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 6,
        sessionKey,
        hoverHit: {
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xfresh',
          objectName: 'FreshPick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 20, y: 40 },
          clientPosition: { x: 10, y: 20 },
        },
        recentHits: [{
          observedAt: '2026-03-30T00:00:01.000Z',
          objectAddress: '0xfresh',
          objectName: 'FreshPick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 20, y: 40 },
          clientPosition: { x: 10, y: 20 },
        }],
      }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 5,
        sessionKey,
        hoverHit: {
          observedAt: '2026-03-30T00:00:02.000Z',
          objectAddress: '0xolder',
          objectName: 'OlderPick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 30, y: 60 },
          clientPosition: { x: 15, y: 30 },
        },
        recentHits: [{
          observedAt: '2026-03-30T00:00:02.000Z',
          objectAddress: '0xolder',
          objectName: 'OlderPick',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [],
          distance: null,
          screenPosition: { x: 30, y: 60 },
          clientPosition: { x: 15, y: 30 },
        }],
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(0);
    expect(latestState?.sceneMousePickerState.hoverHit?.objectAddress).toBe('0xfresh');
    expect(latestState?.sceneMousePickerState.recentHits[0]?.objectAddress).toBe('0xfresh');
  });

  it('loads ancestor branches before revealing a manually opened picker hit in the tree', async () => {
    const repository = createRepository() as SceneGateway & {
      startSceneObjectChildrenAnalysis: ReturnType<typeof vi.fn>;
    };

    repository.startSceneObjectChildrenAnalysis = vi.fn().mockResolvedValue(null);

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.openSceneMousePickHit({
          observedAt: '2026-03-30T00:00:03.000Z',
          objectAddress: '0xleaf',
          objectName: '30101(Clone)',
          transformAddress: null,
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          hierarchyPath: [
            { objectAddress: '0xroot', name: 'GameplayRoot' },
            { objectAddress: '0xparent', name: 'ObjPoolMgr' },
            { objectAddress: '0xleaf', name: '30101(Clone)' },
          ],
          distance: null,
          screenPosition: { x: 40, y: 80 },
          clientPosition: { x: 20, y: 40 },
      });
    });
    await flushEffects();

    expect(latestState?.sceneTabs[0]?.objectAddress).toBe('0xleaf');
    expect(latestState?.selectedObjectAddress).toBe('0xleaf');
    expect(repository.startSceneObjectChildrenAnalysis).toHaveBeenCalledWith('0xroot');
    expect(repository.startSceneObjectChildrenAnalysis).toHaveBeenCalledWith('0xparent');
    expect(repository.startSceneObjectChildrenAnalysis).toHaveBeenCalledWith('0xleaf');
  });

  it('hydrates missing hierarchy roots from inspector headers for the selected object', async () => {
    const repository = createRepository() as SceneGateway & {
      startSceneObjectHeaderAnalysis: ReturnType<typeof vi.fn>;
      startSceneObjectChildrenAnalysis: ReturnType<typeof vi.fn>;
    };

    const gameMgr = createSceneNodeSummary({
      objectAddress: '0xgameMgr',
      name: 'GameMgr',
      hasChildren: true,
      childCount: 1,
    });
    const objPoolMgr = createSceneNodeSummary({
      objectAddress: '0xpoolMgr',
      parentObjectAddress: '0xgameMgr',
      name: 'ObjPoolMgr',
      hasChildren: true,
      childCount: 1,
    });
    const pooledObject = createSceneNodeSummary({
      objectAddress: '0xleaf',
      parentObjectAddress: '0xpoolMgr',
      name: '30101(Clone)',
    });

    repository.startSceneObjectHeaderAnalysis = vi.fn().mockImplementation(async (objectAddress: string) => {
      if (objectAddress === '0xleaf') {
        return createHeaderTaskState({
          taskId: 31,
          resourceRevision: 31,
          objectAddress,
          header: {
            generatedAt: '2026-03-30T00:00:03.000Z',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            object: pooledObject,
            parent: objPoolMgr,
            hierarchyPath: [
              { objectAddress: '0xgameMgr', name: 'GameMgr' },
              { objectAddress: '0xpoolMgr', name: 'ObjPoolMgr' },
              { objectAddress: '0xleaf', name: '30101(Clone)' },
            ],
            transform: null,
          },
        });
      }

      if (objectAddress === '0xpoolMgr') {
        return createHeaderTaskState({
          taskId: 32,
          resourceRevision: 32,
          objectAddress,
          header: {
            generatedAt: '2026-03-30T00:00:03.100Z',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            object: objPoolMgr,
            parent: gameMgr,
            hierarchyPath: [
              { objectAddress: '0xgameMgr', name: 'GameMgr' },
              { objectAddress: '0xpoolMgr', name: 'ObjPoolMgr' },
            ],
            transform: null,
          },
        });
      }

      if (objectAddress === '0xgameMgr') {
        return createHeaderTaskState({
          taskId: 33,
          resourceRevision: 33,
          objectAddress,
          header: {
            generatedAt: '2026-03-30T00:00:03.200Z',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            object: gameMgr,
            parent: null,
            hierarchyPath: [
              { objectAddress: '0xgameMgr', name: 'GameMgr' },
            ],
            transform: null,
          },
        });
      }

      return null;
    });

    repository.startSceneObjectChildrenAnalysis = vi.fn().mockImplementation(async (objectAddress: string) => {
      if (objectAddress === '0xleaf') {
        return {
          taskId: 41,
          resourceRevision: 41,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.000Z',
          updatedAt: '2026-03-30T00:00:03.000Z',
          children: [],
          totalCount: 0,
          loadedCount: 0,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 41,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      if (objectAddress === '0xpoolMgr') {
        return {
          taskId: 42,
          resourceRevision: 42,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.100Z',
          updatedAt: '2026-03-30T00:00:03.100Z',
          children: [pooledObject],
          totalCount: 1,
          loadedCount: 1,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 42,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      if (objectAddress === '0xgameMgr') {
        return {
          taskId: 43,
          resourceRevision: 43,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.200Z',
          updatedAt: '2026-03-30T00:00:03.200Z',
          children: [objPoolMgr],
          totalCount: 1,
          loadedCount: 1,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 43,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      return null;
    });

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.setSelectedObjectAddress('0xleaf');
    });
    await flushEffects();
    await flushEffects();
    await flushEffects();

    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xleaf');
    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xpoolMgr');
    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xgameMgr');
    expect(latestState?.loadedSceneGraph.recordByAddress.get('0xgameMgr')?.depth).toBe(0);
    expect(latestState?.childrenByParent['0xgameMgr']?.[0]?.objectAddress).toBe('0xpoolMgr');
    expect(latestState?.childrenByParent['0xpoolMgr']?.[0]?.objectAddress).toBe('0xleaf');
  });

  it('reveals missing hierarchy roots after the selected object header becomes ready asynchronously', async () => {
    const repository = createRepository() as SceneGateway & {
      startSceneObjectHeaderAnalysis: ReturnType<typeof vi.fn>;
      startSceneObjectChildrenAnalysis: ReturnType<typeof vi.fn>;
    };

    const gameMgr = createSceneNodeSummary({
      objectAddress: '0xgameMgr',
      name: 'GameMgr',
      hasChildren: true,
      childCount: 1,
    });
    const objPoolMgr = createSceneNodeSummary({
      objectAddress: '0xpoolMgr',
      parentObjectAddress: '0xgameMgr',
      name: 'ObjPoolMgr',
      hasChildren: true,
      childCount: 1,
    });
    const pooledObject = createSceneNodeSummary({
      objectAddress: '0xleaf',
      parentObjectAddress: '0xpoolMgr',
      name: '30101(Clone)',
    });

    repository.startSceneObjectHeaderAnalysis = vi.fn().mockImplementation(async (objectAddress: string) => {
      if (objectAddress === '0xleaf') {
        return createHeaderTaskState({
          taskId: 61,
          resourceRevision: 61,
          objectAddress,
          status: 'loading',
          header: null,
          resourceState: createSceneResourceState({
            resourceKind: 'scene-object-header',
            resourceRevision: 61,
            sessionKey: 'session-1',
            freshness: 'refreshing',
            isRetainingSnapshot: false,
            snapshotKind: 'empty',
            errorMessage: null,
          }),
        });
      }

      if (objectAddress === '0xpoolMgr') {
        return createHeaderTaskState({
          taskId: 62,
          resourceRevision: 62,
          objectAddress,
          header: {
            generatedAt: '2026-03-30T00:00:03.100Z',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            object: objPoolMgr,
            parent: gameMgr,
            hierarchyPath: [
              { objectAddress: '0xgameMgr', name: 'GameMgr' },
              { objectAddress: '0xpoolMgr', name: 'ObjPoolMgr' },
            ],
            transform: null,
          },
        });
      }

      if (objectAddress === '0xgameMgr') {
        return createHeaderTaskState({
          taskId: 63,
          resourceRevision: 63,
          objectAddress,
          header: {
            generatedAt: '2026-03-30T00:00:03.200Z',
            sceneHandle: 7,
            sceneName: 'Gameplay',
            sceneKind: 'loaded',
            object: gameMgr,
            parent: null,
            hierarchyPath: [
              { objectAddress: '0xgameMgr', name: 'GameMgr' },
            ],
            transform: null,
          },
        });
      }

      return null;
    });

    repository.startSceneObjectChildrenAnalysis = vi.fn().mockImplementation(async (objectAddress: string) => {
      if (objectAddress === '0xleaf') {
        return {
          taskId: 71,
          resourceRevision: 71,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.000Z',
          updatedAt: '2026-03-30T00:00:03.000Z',
          children: [],
          totalCount: 0,
          loadedCount: 0,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 71,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      if (objectAddress === '0xpoolMgr') {
        return {
          taskId: 72,
          resourceRevision: 72,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.100Z',
          updatedAt: '2026-03-30T00:00:03.100Z',
          children: [pooledObject],
          totalCount: 1,
          loadedCount: 1,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 72,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      if (objectAddress === '0xgameMgr') {
        return {
          taskId: 73,
          resourceRevision: 73,
          sessionKey: 'session-1',
          parentObjectAddress: objectAddress,
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.200Z',
          updatedAt: '2026-03-30T00:00:03.200Z',
          children: [objPoolMgr],
          totalCount: 1,
          loadedCount: 1,
          nextOffset: null,
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'children',
            resourceRevision: 73,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        };
      }

      return null;
    });

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.setSelectedObjectAddress('0xleaf');
    });
    await flushEffects();

    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xleaf');
    expect(repository.startSceneObjectHeaderAnalysis).not.toHaveBeenCalledWith('0xgameMgr');

    await act(async () => {
      await headerTaskUpdatedHandler?.(createHeaderTaskState({
        taskId: 64,
        resourceRevision: 64,
        objectAddress: '0xleaf',
        header: {
          generatedAt: '2026-03-30T00:00:03.300Z',
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          object: pooledObject,
          parent: objPoolMgr,
          hierarchyPath: [
            { objectAddress: '0xgameMgr', name: 'GameMgr' },
            { objectAddress: '0xpoolMgr', name: 'ObjPoolMgr' },
            { objectAddress: '0xleaf', name: '30101(Clone)' },
          ],
          transform: null,
        },
      }));
    });
    await flushEffects();
    await flushEffects();
    await flushEffects();

    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xpoolMgr');
    expect(repository.startSceneObjectHeaderAnalysis).toHaveBeenCalledWith('0xgameMgr');
    expect(latestState?.loadedSceneGraph.recordByAddress.get('0xgameMgr')?.depth).toBe(0);
    expect(latestState?.childrenByParent['0xgameMgr']?.[0]?.objectAddress).toBe('0xpoolMgr');
  });

  it('serializes active mutations and keeps only the latest queued active intent for an object', async () => {
    const repository = createRepository() as SceneGateway & {
      setSceneObjectActive: ReturnType<typeof vi.fn>;
    };
    const firstMutation = createDeferred<RuntimeSceneMutationResult>();
    const secondMutation = createDeferred<RuntimeSceneMutationResult>();

    repository.setSceneObjectActive = vi.fn()
      .mockImplementationOnce(() => firstMutation.promise)
      .mockImplementationOnce(() => secondMutation.promise);

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.setSelectedObjectAddress('0xroot');
    });
    await flushEffects();

    let firstPromise: Promise<RuntimeSceneMutationResult | null> | undefined;
    let secondPromise: Promise<RuntimeSceneMutationResult | null> | undefined;
    let thirdPromise: Promise<RuntimeSceneMutationResult | null> | undefined;

    await act(async () => {
      firstPromise = latestState?.setSceneObjectActive(false);
      secondPromise = latestState?.setSceneObjectActive(true);
      thirdPromise = latestState?.setSceneObjectActive(false);
      await Promise.resolve();
    });

    expect(repository.setSceneObjectActive).toHaveBeenCalledTimes(1);
    expect(repository.setSceneObjectActive).toHaveBeenCalledWith('0xroot', false);
    expect(latestState?.sceneMutationState.activeIntentByObject['0xroot']?.desiredActiveSelf).toBe(false);
    expect(latestState?.sceneMutationState.pendingOperations['set-active']).toBe(2);

    await act(async () => {
      firstMutation.resolve(createSceneMutationResult({
        operation: 'set-active',
        activeSelf: false,
        object: createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', activeSelf: false }),
      }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(repository.setSceneObjectActive).toHaveBeenCalledTimes(2);
    expect(repository.setSceneObjectActive).toHaveBeenNthCalledWith(2, '0xroot', false);

    await act(async () => {
      secondMutation.resolve(createSceneMutationResult({
        operation: 'set-active',
        activeSelf: false,
        object: createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', activeSelf: false }),
      }));
      await Promise.resolve();
    });
    await flushEffects();

    await expect(firstPromise).resolves.toEqual(expect.objectContaining({ activeSelf: false }));
    await expect(secondPromise).resolves.toBeNull();
    await expect(thirdPromise).resolves.toEqual(expect.objectContaining({ activeSelf: false }));
    expect(latestState?.sceneMutationState.pendingOperations['set-active']).toBeUndefined();
    expect(latestState?.sceneMutationState.activeIntentByObject['0xroot']).toBeUndefined();
  });

  it('keeps canonical active truth when a retained header payload arrives after a set-active mutation ack', async () => {
    const repository = createRepository() as SceneGateway & {
      startSceneObjectHeaderAnalysis: ReturnType<typeof vi.fn>;
      setSceneObjectActive: ReturnType<typeof vi.fn>;
    };

    repository.startSceneObjectHeaderAnalysis = vi.fn().mockResolvedValue(createHeaderTaskState());
    repository.setSceneObjectActive = vi.fn().mockResolvedValue(createSceneMutationResult({
      operation: 'set-active',
      activeSelf: false,
      object: createSceneNodeSummary({
        objectAddress: '0xroot',
        name: 'GameplayRoot',
        activeSelf: false,
      }),
    }));

    await act(async () => {
      root.render(createElement(HookHarness, { repository }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.setSelectedObjectAddress('0xroot');
    });
    await flushEffects();

    expect(latestState?.sceneInspector?.object.activeSelf).toBe(true);

    await act(async () => {
      await latestState?.setSceneObjectActive(false);
    });
    await flushEffects();

    expect(latestState?.sceneInspector?.object.activeSelf).toBe(false);

    await act(async () => {
      await headerTaskUpdatedHandler?.(createHeaderTaskState({
        resourceRevision: 9,
        mutationEpoch: 1,
        status: 'loading',
        updatedAt: '2026-03-30T00:00:02.000Z',
        header: {
          generatedAt: '2026-03-30T00:00:02.000Z',
          sceneHandle: 7,
          sceneName: 'Gameplay',
          sceneKind: 'loaded',
          object: createSceneNodeSummary({
            objectAddress: '0xroot',
            name: 'GameplayRoot',
            activeSelf: true,
          }),
          parent: null,
          hierarchyPath: [{ objectAddress: '0xroot', name: 'GameplayRoot' }],
          transform: null,
        },
        resourceState: createSceneResourceState({
          resourceKind: 'scene-object-header',
          resourceRevision: 9,
          sessionKey: 'session-1',
          freshness: 'refreshing',
          isRetainingSnapshot: true,
          snapshotKind: 'retained',
          errorMessage: null,
        }),
      }));
    });
    await flushEffects();

    expect(latestState?.sceneInspector?.object.activeSelf).toBe(false);
  });
});