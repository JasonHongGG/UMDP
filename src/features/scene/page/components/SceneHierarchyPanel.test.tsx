// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { SceneHierarchyPanel } from './SceneHierarchyPanel';
import { createSceneDescriptor, createSceneNodeSummary, createSceneWorkspaceState } from '../testUtils';

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

    mockUseSceneTreeState.mockReturnValue({
      sceneWorkspace: createSceneWorkspaceState({
        snapshot: {
          generatedAt: '2026-03-30T00:00:00.000Z',
          scenes: [createSceneDescriptor({ roots: [environmentRoot, cameraRig] })],
          buildSettingsScenes: [],
        },
      }),
      refreshSceneWorkspace: vi.fn().mockResolvedValue(undefined),
      selectedObjectAddress: null,
      setSelectedObjectAddress: vi.fn(),
      childrenByParent: {
        '0xroot-1': [matchChild],
      },
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
});