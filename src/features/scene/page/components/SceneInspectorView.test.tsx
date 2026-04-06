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

vi.mock('@/app/state/useAnalysisWorkspace', () => ({
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

function findButtonByTextInDocument(text: string) {
  return Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text)) ?? null;
}

function findButtonByTestId(container: HTMLElement, testId: string) {
  return container.querySelector(`button[data-testid="${testId}"]`) as HTMLButtonElement | null;
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
      sceneTabs: [],
      activeSceneTabIndex: -1,
      handleCloseTab: vi.fn(),
      setActiveSceneTabIndex: vi.fn(),
      sceneInspector: createSceneInspectorSnapshot({
        object: player,
        parent: gameplayRoot,
        hierarchyPath: [
          { objectAddress: gameplayRoot.objectAddress, name: gameplayRoot.name },
          { objectAddress: player.objectAddress, name: player.name },
        ],
      }),
      sceneInspectorHeaderTaskState: null,
      sceneInspectorComponentsTaskState: null,
      sceneInspectorComponentsPanel: {
        objectAddress: player.objectAddress,
        components: [],
        totalCount: 0,
        loadedCount: 0,
        status: 'ready',
        isLoading: false,
        isStale: false,
        errorMessage: null,
      },
      sceneInspectorLoading: false,
      sceneInspectorChildrenLoading: false,
      sceneInspectorComponentsLoading: false,
      sceneInspectorError: null,
      sceneInspectorComponentsError: null,
      sceneObjectComponentsCapability: {
        status: 'supported',
        strategy: 'get-components-by-type',
        reason: null,
        checkedAt: '2026-04-06T12:00:00.000Z',
      },
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

    const reparentAccordion = findButtonByText(container, 'Hierarchy Path & Reparenting');
    expect(reparentAccordion).not.toBeNull();

    await act(async () => {
      reparentAccordion!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const copyButton = findButtonByTestId(container, 'scene-copy-path');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(clipboardWriteText).toHaveBeenCalledWith('GameplayRoot/Player');
    expect(container.textContent).toContain('Static');
  });

  it('applies reparenting from the searchable loaded-node candidate list', async () => {
    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const reparentAccordion = findButtonByText(container, 'Hierarchy Path & Reparenting');
    expect(reparentAccordion).not.toBeNull();

    await act(async () => {
      reparentAccordion!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[placeholder="Search node..."]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      searchInput!.value = 'ui';
      searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushEffects();

    const selectTrigger = findButtonByText(container, 'GameplayRoot (GameplayRoot)');
    expect(selectTrigger).not.toBeNull();

    await act(async () => {
      selectTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const candidateButton = findButtonByTextInDocument('UILayer');
    expect(candidateButton).not.toBeNull();

    await act(async () => {
      candidateButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const applyButton = findButtonByText(container, 'Apply Parent Changes');
    expect(applyButton).not.toBeNull();

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

    const dragHandles = Array.from(container.querySelectorAll('div.cursor-ew-resize'));
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
      localPosition: expect.objectContaining({ x: 1.3 }),
    }));
  });

  it('renders a components error locally without promoting it to the top-level inspector error area', async () => {
    const componentsError = 'Scene object component enumeration is unavailable: GameObject.GetComponentCount is missing.';
    mockUseSceneInspectorState.mockReturnValue({
      setSelectedObjectAddress: vi.fn(),
      sceneTabs: [],
      activeSceneTabIndex: -1,
      handleCloseTab: vi.fn(),
      setActiveSceneTabIndex: vi.fn(),
      sceneInspector: createSceneInspectorSnapshot(),
      sceneInspectorHeaderTaskState: null,
      sceneInspectorComponentsTaskState: null,
      sceneInspectorComponentsPanel: {
        objectAddress: '0x1000',
        components: [],
        totalCount: 0,
        loadedCount: 0,
        status: 'error',
        isLoading: false,
        isStale: false,
        errorMessage: componentsError,
      },
      sceneInspectorLoading: false,
      sceneInspectorChildrenLoading: false,
      sceneInspectorComponentsLoading: false,
      sceneInspectorError: null,
      sceneInspectorComponentsError: componentsError,
      sceneObjectComponentsCapability: {
        status: 'supported',
        strategy: 'get-components-by-type',
        reason: null,
        checkedAt: '2026-04-06T12:00:00.000Z',
      },
    });

    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const occurrences = (container.textContent?.split(componentsError).length ?? 1) - 1;
    expect(container.textContent).toContain(componentsError);
    expect(occurrences).toBe(1);
  });

  it('renders components from the canonical panel state with quiet icon-first controls', async () => {
    const behaviourComponent = {
      componentAddress: '0xcomponent-behaviour',
      typeName: 'PlayerController',
      isBehaviour: true,
      behaviourEnabled: true,
    };
    const readonlyComponent = {
      componentAddress: '0xcomponent-readonly',
      typeName: 'UnityEngine.Transform',
      isBehaviour: false,
      behaviourEnabled: null,
    };

    mockUseSceneInspectorState.mockReturnValue({
      setSelectedObjectAddress: vi.fn(),
      sceneTabs: [],
      activeSceneTabIndex: -1,
      handleCloseTab: vi.fn(),
      setActiveSceneTabIndex: vi.fn(),
      sceneInspector: createSceneInspectorSnapshot({
        object: createSceneNodeSummary({ objectAddress: '0xplayer', name: 'Player', componentCount: 0 }),
        components: [],
      }),
      sceneInspectorHeaderTaskState: null,
      sceneInspectorComponentsTaskState: null,
      sceneInspectorComponentsPanel: {
        objectAddress: '0xplayer',
        components: [behaviourComponent, readonlyComponent],
        totalCount: 2,
        loadedCount: 2,
        status: 'ready',
        isLoading: false,
        isStale: false,
        errorMessage: null,
      },
      sceneInspectorLoading: false,
      sceneInspectorChildrenLoading: false,
      sceneInspectorComponentsLoading: false,
      sceneInspectorError: null,
      sceneInspectorComponentsError: null,
      sceneObjectComponentsCapability: {
        status: 'supported',
        strategy: 'get-components-by-type',
        reason: null,
        checkedAt: '2026-04-06T12:00:00.000Z',
      },
    });

    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    expect(container.textContent).toContain('Components (2)');
    expect(container.textContent).toContain('PlayerController');
    expect(container.textContent).toContain('UnityEngine.Transform');
    expect(container.textContent).not.toContain('Materialized 2/2');
    expect(container.textContent).not.toContain('Behaviour');
    expect(container.textContent).not.toContain('Read-only');
    expect(findButtonByTestId(container, 'scene-component-toggle-0xcomponent-behaviour')).not.toBeNull();
    expect(findButtonByTestId(container, 'scene-component-remove-0xcomponent-readonly')).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('keeps the active control interactive while the pending intent collapses into a quiet icon state', async () => {
    mockUseSceneMutationState.mockReturnValue({
      createSceneChild: vi.fn().mockResolvedValue(null),
      duplicateSceneObject: vi.fn().mockResolvedValue(null),
      deleteSceneObject: vi.fn().mockResolvedValue(null),
      renameSceneObject: vi.fn().mockResolvedValue(null),
      setSceneObjectTag: vi.fn().mockResolvedValue(null),
      setSceneObjectLayer: vi.fn().mockResolvedValue(null),
      setSceneObjectHideFlags: vi.fn().mockResolvedValue(null),
      reparentSceneObject: vi.fn().mockResolvedValue(null),
      setSceneObjectActive: vi.fn().mockResolvedValue(null),
      setSceneObjectTransform: vi.fn().mockResolvedValue(null),
      setSceneBehaviourEnabled: vi.fn().mockResolvedValue(null),
      createSceneComponent: vi.fn().mockResolvedValue(null),
      deleteSceneComponent: vi.fn().mockResolvedValue(null),
      isSceneMutationPending: (operation: string) => operation === 'set-active',
      sceneMutationState: {
        operation: 'set-active',
        loading: true,
        errorMessage: null,
        pendingOperations: { 'set-active': 1 },
        activeIntentByObject: {
          '0xplayer': {
            desiredActiveSelf: false,
            status: 'running',
          },
        },
      },
    });

    await act(async () => {
      root.render(createElement(SceneInspectorView));
    });
    await flushEffects();

    const toggleButton = findButtonByTestId(container, 'scene-object-active-toggle');
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;

    expect(toggleButton).not.toBeNull();
    expect(toggleButton?.disabled).toBe(false);
    expect(container.textContent).not.toContain('Syncing');
    expect(container.textContent).not.toContain('Deactivating…');
    expect(nameInput?.disabled).toBe(false);
  });
});