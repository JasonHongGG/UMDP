// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { SceneHierarchyPanel } from './SceneHierarchyPanel';
import { buildLoadedSceneGraph } from '../loadedSceneNodes';
import { createSceneDescriptor, createSceneNodeSummary, createSceneResourceState, createSceneWorkspaceState } from '../testUtils';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseSceneTreeState = vi.fn();
const mockUseSceneMutationState = vi.fn();

vi.mock('../SceneWorkspaceContext', () => ({
  useSceneTreeState: () => mockUseSceneTreeState(),
  useSceneMutationState: () => mockUseSceneMutationState(),
}));

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SceneHierarchyPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const environmentRoot = createSceneNodeSummary({ objectAddress: '0xroot-1', name: 'EnvironmentRoot', hasChildren: true, childCount: 1, path: 'EnvironmentRoot' });
    const cameraRig = createSceneNodeSummary({ objectAddress: '0xroot-2', name: 'CameraRig', path: 'CameraRig' });
    const matchChild = createSceneNodeSummary({ objectAddress: '0xchild-1', parentObjectAddress: '0xroot-1', name: 'MatchChild', path: 'EnvironmentRoot/MatchChild' });
    const sceneWorkspace = createSceneWorkspaceState({
      snapshot: {
        generatedAt: '2026-03-30T00:00:00.000Z',
        scenes: [createSceneDescriptor({ roots: [environmentRoot, cameraRig] })],
        buildSettingsScenes: [],
      },
    });
    const childrenByParent = {
      '0xroot-1': [matchChild],
    };

    mockUseSceneTreeState.mockReturnValue({
      sceneWorkspace,
      refreshSceneWorkspace: vi.fn().mockResolvedValue(undefined),
      selectedObjectAddress: null,
      setSelectedObjectAddress: vi.fn(),
      openTabForSceneObject: vi.fn(),
      loadedSceneGraph: buildLoadedSceneGraph(sceneWorkspace, childrenByParent),
      childrenByParent,
      childTaskByParent: {},
      loadingChildrenByParent: {},
      childErrorByParent: {},
      ensureSceneObjectChildrenLoaded: vi.fn().mockResolvedValue(undefined),
      stopSceneObjectChildrenObservation: vi.fn(),
    });

    mockUseSceneMutationState.mockReturnValue({
      createSceneRoot: vi.fn().mockResolvedValue(null),
      loadSceneByBuildIndex: vi.fn().mockResolvedValue(null),
      isSceneMutationPending: vi.fn().mockReturnValue(false),
      sceneMutationState: {
        operation: null,
        loading: false,
        errorMessage: null,
        pendingOperations: {},
        activeIntentByObject: {},
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    mockUseSceneTreeState.mockReset();
    mockUseSceneMutationState.mockReset();
  });

  it('filters the hierarchy using only already loaded nodes while keeping ancestor context', async () => {
    await act(async () => {
      root.render(createElement(SceneHierarchyPanel));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[placeholder="Search loaded objects"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      setInputValue(searchInput!, 'match');
    });
    await flushEffects();

    expect(container.textContent).toContain('EnvironmentRoot');
    expect(container.textContent).toContain('MatchChild');
    expect(container.textContent).not.toContain('CameraRig');
  });

  it('auto-expands loaded ancestors for the selected object', async () => {
    const rootNode = createSceneNodeSummary({ objectAddress: '0xroot-1', name: 'GameplayRoot', hasChildren: true, childCount: 1, path: 'GameplayRoot' });
    const parentNode = createSceneNodeSummary({ objectAddress: '0xparent-1', parentObjectAddress: '0xroot-1', name: 'ObjPoolMgr', hasChildren: true, childCount: 1, path: 'GameplayRoot/ObjPoolMgr' });
    const leafNode = createSceneNodeSummary({ objectAddress: '0xleaf-1', parentObjectAddress: '0xparent-1', name: '30101(Clone)', path: 'GameplayRoot/ObjPoolMgr/30101(Clone)' });
    const sceneWorkspace = createSceneWorkspaceState({
      snapshot: {
        generatedAt: '2026-03-30T00:00:00.000Z',
        scenes: [createSceneDescriptor({ roots: [rootNode] })],
        buildSettingsScenes: [],
      },
    });
    const childrenByParent = {
      '0xroot-1': [parentNode],
      '0xparent-1': [leafNode],
    };

    mockUseSceneTreeState.mockReturnValue({
      sceneWorkspace,
      refreshSceneWorkspace: vi.fn().mockResolvedValue(undefined),
      selectedObjectAddress: '0xleaf-1',
      setSelectedObjectAddress: vi.fn(),
      openTabForSceneObject: vi.fn(),
      loadedSceneGraph: buildLoadedSceneGraph(sceneWorkspace, childrenByParent),
      childrenByParent,
      childTaskByParent: {},
      loadingChildrenByParent: {},
      childErrorByParent: {},
      ensureSceneObjectChildrenLoaded: vi.fn().mockResolvedValue(undefined),
      stopSceneObjectChildrenObservation: vi.fn(),
    });

    await act(async () => {
      root.render(createElement(SceneHierarchyPanel));
    });
    await flushEffects();

    expect(container.textContent).toContain('GameplayRoot');
    expect(container.textContent).toContain('ObjPoolMgr');
    expect(container.textContent).toContain('30101(Clone)');
  });

  it('renders discovered root nodes from the loaded scene graph even when the original catalog missed them', async () => {
    const gameplayRoot = createSceneNodeSummary({ objectAddress: '0xroot-1', name: 'GameplayRoot', path: 'GameplayRoot' });
    const gameMgr = createSceneNodeSummary({ objectAddress: '0xgameMgr', name: 'GameMgr', hasChildren: true, childCount: 1, path: 'GameMgr' });
    const objPoolMgr = createSceneNodeSummary({ objectAddress: '0xpoolMgr', parentObjectAddress: '0xgameMgr', name: 'ObjPoolMgr', hasChildren: true, childCount: 1, path: 'GameMgr/ObjPoolMgr' });
    const pooledObject = createSceneNodeSummary({ objectAddress: '0xleaf', parentObjectAddress: '0xpoolMgr', name: '30101(Clone)', path: 'GameMgr/ObjPoolMgr/30101(Clone)' });
    const sceneWorkspace = createSceneWorkspaceState({
      snapshot: {
        generatedAt: '2026-03-30T00:00:00.000Z',
        scenes: [createSceneDescriptor({ sceneHandle: 7, name: 'Gameplay', roots: [gameplayRoot] })],
        buildSettingsScenes: [],
      },
    });
    const childrenByParent = {
      '0xgameMgr': [objPoolMgr],
      '0xpoolMgr': [pooledObject],
    };

    mockUseSceneTreeState.mockReturnValue({
      sceneWorkspace,
      refreshSceneWorkspace: vi.fn().mockResolvedValue(undefined),
      selectedObjectAddress: '0xleaf',
      setSelectedObjectAddress: vi.fn(),
      openTabForSceneObject: vi.fn(),
      loadedSceneGraph: buildLoadedSceneGraph(sceneWorkspace, childrenByParent, {
        '0xleaf': {
          taskId: 51,
          resourceRevision: 51,
          sessionKey: 'session-1',
          objectAddress: '0xleaf',
          status: 'ready',
          mutationEpoch: 0,
          startedAt: '2026-03-30T00:00:03.000Z',
          updatedAt: '2026-03-30T00:00:03.000Z',
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
          errorMessage: null,
          isStale: false,
          resourceState: createSceneResourceState({
            resourceKind: 'scene-object-header',
            resourceRevision: 51,
            sessionKey: 'session-1',
            freshness: 'fresh',
          }),
        },
      }),
      sceneHierarchySearchQuery: '',
      setSceneHierarchySearchQuery: vi.fn(),
      sceneHierarchySearch: null,
      childrenByParent,
      childTaskByParent: {},
      loadingChildrenByParent: {},
      childErrorByParent: {},
      ensureSceneObjectChildrenLoaded: vi.fn().mockResolvedValue(undefined),
      stopSceneObjectChildrenObservation: vi.fn(),
    });

    await act(async () => {
      root.render(createElement(SceneHierarchyPanel));
    });
    await flushEffects();

    expect(container.textContent).toContain('GameplayRoot');
    expect(container.textContent).toContain('GameMgr');
    expect(container.textContent).toContain('ObjPoolMgr');
    expect(container.textContent).toContain('30101(Clone)');
  });
});