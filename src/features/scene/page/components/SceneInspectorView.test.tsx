// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { SceneInspectorView } from './SceneInspectorView';
import { createSceneDescriptor, createSceneInspectorSnapshot, createSceneNodeSummary, createSceneWorkspaceState } from '../testUtils';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseAnalysisWorkspace = vi.fn();
const mockUseSceneWorkspace = vi.fn();
const mockUseSceneInspectorState = vi.fn();
const mockUseSceneMutationState = vi.fn();

vi.mock('@/domain/analysis/AnalysisWorkspaceContext', () => ({
  useAnalysisWorkspace: () => mockUseAnalysisWorkspace(),
}));

vi.mock('../SceneWorkspaceContext', () => ({
  useSceneWorkspace: () => mockUseSceneWorkspace(),
  useSceneInspectorState: () => mockUseSceneInspectorState(),
  useSceneMutationState: () => mockUseSceneMutationState(),
}));

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(text)) ?? null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SceneInspectorView', () => {
  let container: HTMLDivElement;
  let root: Root;
  let clipboardWriteText: ReturnType<typeof vi.fn>;
  let reparentSceneObject: ReturnType<typeof vi.fn>;
  let setSceneObjectTransform: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    if (typeof window.PointerEvent === 'undefined') {
      // jsdom on some environments exposes MouseEvent only.
      // @ts-expect-error test shim
      window.PointerEvent = window.MouseEvent;
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    const gameplayRoot = createSceneNodeSummary({ objectAddress: '0xroot', name: 'GameplayRoot', hasChildren: true, childCount: 1, path: 'GameplayRoot' });
    const uiRoot = createSceneNodeSummary({ objectAddress: '0xui-root', name: 'UIRoot', hasChildren: true, childCount: 1, path: 'UIRoot' });
    const uiLayer = createSceneNodeSummary({ objectAddress: '0xui', parentObjectAddress: '0xui-root', name: 'UILayer', path: 'UIRoot/UILayer' });
    const player = createSceneNodeSummary({
      objectAddress: '0xplayer',
      parentObjectAddress: '0xroot',
      name: 'Player',
      isStatic: true,
      childCount: 0,
      hasChildren: false,
      path: 'GameplayRoot/Player',
    });

    mockUseAnalysisWorkspace.mockReturnValue({
      analysisSnapshot: {
        classes: {},
      },
    });

    mockUseSceneWorkspace.mockReturnValue({
      sceneWorkspace: createSceneWorkspaceState({
        snapshot: {
          generatedAt: '2026-03-30T00:00:00.000Z',
          scenes: [createSceneDescriptor({ roots: [gameplayRoot, uiRoot] })],
          buildSettingsScenes: [],
        },
      }),
      childrenByParent: {
        '0xui-root': [uiLayer],
      },
    });

    mockUseSceneInspectorState.mockReturnValue({
      setSelectedObjectAddress: vi.fn(),
      sceneInspector: createSceneInspectorSnapshot({
        object: player,
        parent: gameplayRoot,
        hierarchyPath: [
          { objectAddress: gameplayRoot.objectAddress, name: gameplayRoot.name },
          { objectAddress: player.objectAddress, name: player.name },
        ],
      }),
      sceneInspectorTaskState: null,
      sceneInspectorLoading: false,
      sceneInspectorChildrenLoading: false,
      sceneInspectorComponentsLoading: false,
      sceneInspectorError: null,
    });

    reparentSceneObject = vi.fn().mockResolvedValue(null);
    setSceneObjectTransform = vi.fn().mockResolvedValue(null);

    mockUseSceneMutationState.mockReturnValue({
      createSceneChild: vi.fn().mockResolvedValue(null),
      duplicateSceneObject: vi.fn().mockResolvedValue(null),
      deleteSceneObject: vi.fn().mockResolvedValue(null),
      renameSceneObject: vi.fn().mockResolvedValue(null),
      setSceneObjectTag: vi.fn().mockResolvedValue(null),
      setSceneObjectLayer: vi.fn().mockResolvedValue(null),
      setSceneObjectHideFlags: vi.fn().mockResolvedValue(null),
      reparentSceneObject,
      setSceneObjectActive: vi.fn().mockResolvedValue(null),
      setSceneObjectTransform,
      setSceneBehaviourEnabled: vi.fn().mockResolvedValue(null),
      createSceneComponent: vi.fn().mockResolvedValue(null),
      deleteSceneComponent: vi.fn().mockResolvedValue(null),
      sceneMutationState: {
        operation: null,
        loading: false,
        errorMessage: null,
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    mockUseAnalysisWorkspace.mockReset();
    mockUseSceneWorkspace.mockReset();
    mockUseSceneInspectorState.mockReset();
    mockUseSceneMutationState.mockReset();
  });

  it('shows static state and copies the canonical hierarchy path', async () => {
    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const copyButton = findButtonByText(container, 'Copy Path');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(clipboardWriteText).toHaveBeenCalledWith('GameplayRoot/Player');
    expect(container.textContent).toContain('Static');
    expect(container.textContent).toContain('Hierarchy path copied.');
  });

  it('applies reparenting from the searchable loaded-node candidate list', async () => {
    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[placeholder="Search parent by loaded name or path"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      searchInput!.value = 'ui';
      searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushEffects();

    const candidateButton = findButtonByText(container, 'UILayer');
    const applyButton = findButtonByText(container, 'Apply Parent');
    expect(candidateButton).not.toBeNull();
    expect(applyButton).not.toBeNull();

    await act(async () => {
      candidateButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      applyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(reparentSceneObject).toHaveBeenCalledWith('0xui', 'UIRoot/UILayer');
  });

  it('commits transform drag edits only on pointer release', async () => {
    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const dragHandles = Array.from(container.querySelectorAll('button[aria-label="Drag X value"]'));
    expect(dragHandles.length).toBeGreaterThan(0);

    await act(async () => {
      dragHandles[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    });

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 16, clientY: 0 }));
    });

    expect(setSceneObjectTransform).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 16, clientY: 0 }));
    });
    await flushEffects();

    expect(setSceneObjectTransform).toHaveBeenCalledTimes(1);
    expect(setSceneObjectTransform).toHaveBeenCalledWith(expect.objectContaining({
      worldPosition: expect.objectContaining({ x: 1.2 }),
    }));
  });
});