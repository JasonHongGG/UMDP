// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { useSceneWorkspaceState } from './useSceneWorkspaceState';
import { createSceneDescriptor, createSceneNodeSummary, createSceneWorkspaceState } from './testUtils';

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
});