// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { useSceneWorkspaceState } from './useSceneWorkspaceState';
import { createSceneDescriptor, createSceneNodeSummary, createSceneResourceState, createSceneWorkspaceState } from './testUtils';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let workspaceStateUpdatedHandler: ((state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) | null = null;

vi.mock('@/infrastructure/tauri/TauriSceneEvents', () => ({
  onSceneWorkspaceStateUpdated: vi.fn(async (handler: (state: ReturnType<typeof createSceneWorkspaceState>) => void | Promise<void>) => {
    workspaceStateUpdatedHandler = handler;
    return () => {
      workspaceStateUpdatedHandler = null;
    };
  }),
  onSceneObjectChildrenTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
  onSceneObjectInspectorTaskUpdated: vi.fn().mockResolvedValue(() => undefined),
}));

interface HookSnapshot {
  sceneWorkspace: ReturnType<typeof useSceneWorkspaceState>['sceneWorkspace'];
  sceneRootsByHandle: ReturnType<typeof useSceneWorkspaceState>['sceneRootsByHandle'];
  childrenByParent: ReturnType<typeof useSceneWorkspaceState>['childrenByParent'];
  childTaskByParent: ReturnType<typeof useSceneWorkspaceState>['childTaskByParent'];
  loadingChildrenByParent: ReturnType<typeof useSceneWorkspaceState>['loadingChildrenByParent'];
  ensureSceneObjectChildrenLoaded: ReturnType<typeof useSceneWorkspaceState>['ensureSceneObjectChildrenLoaded'];
  stopSceneObjectChildrenObservation: ReturnType<typeof useSceneWorkspaceState>['stopSceneObjectChildrenObservation'];
}

let latestState: HookSnapshot | null = null;

function createLifecycle(overrides: Partial<WorkspaceLifecycleState> = {}): WorkspaceLifecycleState {
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
      sessionKey: 'session-1',
      ...overrides.runtimeSession,
    },
  };
}

function createRepository(): SceneGateway {
  const workspace = createSceneWorkspaceState({
    resourceRevision: 4,
    sessionKey: 'session-1',
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

  return {
    getSceneWorkspaceState: vi.fn().mockResolvedValue(workspace),
    startSceneRefresh: vi.fn().mockResolvedValue(workspace),
    startSceneObjectChildrenAnalysis: vi.fn().mockResolvedValue(null),
    cancelSceneObjectChildrenAnalysis: vi.fn(),
    cancelSceneObjectInspectorAnalysis: vi.fn(),
  } as unknown as SceneGateway;
}

function HookHarness({ repository }: { repository: SceneGateway }) {
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
    }),
    active: true,
  });

  latestState = {
    sceneWorkspace: state.sceneWorkspace,
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
});