// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { RuntimeSceneMousePickerSnapshot } from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { useSceneWorkspaceState } from './useSceneWorkspaceState';
import { createSceneDescriptor, createSceneNodeSummary, createSceneResourceState, createSceneWorkspaceState } from './testUtils';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let workspaceStateUpdatedHandler: ((state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) | null = null;
let mousePickerStateUpdatedHandler: ((state: RuntimeSceneMousePickerSnapshot) => void | Promise<void>) | null = null;

vi.mock('@/infrastructure/tauri/TauriSceneEvents', () => ({
  onSceneWorkspaceStateUpdated: vi.fn(async (handler: (state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) => {
    workspaceStateUpdatedHandler = handler;
    return () => {
      workspaceStateUpdatedHandler = null;
    };
  }),
  onSceneObjectChildrenTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
  onSceneObjectHeaderTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
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
  sceneTabs: ReturnType<typeof useSceneWorkspaceState>['sceneTabs'];
  activeSceneTabIndex: ReturnType<typeof useSceneWorkspaceState>['activeSceneTabIndex'];
  sceneRootsByHandle: ReturnType<typeof useSceneWorkspaceState>['sceneRootsByHandle'];
  childrenByParent: ReturnType<typeof useSceneWorkspaceState>['childrenByParent'];
  childTaskByParent: ReturnType<typeof useSceneWorkspaceState>['childTaskByParent'];
  loadingChildrenByParent: ReturnType<typeof useSceneWorkspaceState>['loadingChildrenByParent'];
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
    currentCandidate: null,
    committedPick: null,
    recentPicks: [],
    lastUpdatedAt: null,
    errorMessage: null,
    ...overrides,
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
  } as unknown as SceneGateway;
}

function HookHarness({ repository, sessionKey = 'session-1' }: { repository: SceneGateway; sessionKey?: string }) {
  const state = useSceneWorkspaceState({
    repository,
    workspaceLifecycle: createLifecycle({
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
    sceneTabs: state.sceneTabs,
    activeSceneTabIndex: state.activeSceneTabIndex,
    sceneRootsByHandle: state.sceneRootsByHandle,
    childrenByParent: state.childrenByParent,
    childTaskByParent: state.childTaskByParent,
    loadingChildrenByParent: state.loadingChildrenByParent,
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

  it('opens a scene tab when a fresh mouse picker hit arrives', async () => {
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
        status: 'idle',
        statusDetail: 'Opened PickedRoot in the Scene inspector.',
        committedPick: {
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
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(1);
    expect(latestState?.sceneTabs[0]?.objectAddress).toBe('0xpick');
    expect(latestState?.sceneTabs[0]?.name).toBe('PickedRoot');
    expect(latestState?.activeSceneTabIndex).toBe(0);
    expect(latestState?.selectedObjectAddress).toBe('0xpick');
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
        committedPick: {
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
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(0);
    expect(latestState?.selectedObjectAddress).toBeNull();
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
        committedPick: {
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
      }));
    });
    await flushEffects();

    await act(async () => {
      await mousePickerStateUpdatedHandler?.(createMousePickerState({
        resourceRevision: 5,
        sessionKey,
        committedPick: {
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
      }));
    });
    await flushEffects();

    expect(latestState?.sceneTabs).toHaveLength(1);
    expect(latestState?.sceneTabs[0]?.objectAddress).toBe('0xfresh');
    expect(latestState?.selectedObjectAddress).toBe('0xfresh');
  });
});