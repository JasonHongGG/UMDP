// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { InspectorPage } from './InspectorPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inspectorPageState = vi.hoisted(() => ({
  blocked: true,
  controllerHookSpy: vi.fn(),
}));

vi.mock('@/features/inspector/components/SidebarTools', () => ({
  SidebarTools: () => null,
}));

vi.mock('@/features/inspector/components/GlobalSearchSidebar', () => ({
  GlobalSearchSidebar: () => null,
}));

vi.mock('@/features/inspector/components/ClassReferenceSidebar', () => ({
  ClassReferenceSidebar: () => null,
}));

vi.mock('@/features/inspector/components/AssembliesColumn', () => ({
  AssembliesColumn: () => null,
}));

vi.mock('@/features/inspector/components/ClassesColumn', () => ({
  ClassesColumn: () => null,
}));

vi.mock('@/features/inspector/components/InspectorTabBar', () => ({
  InspectorTabBar: () => null,
}));

vi.mock('@/features/inspector/components/ClassInspectorApp', () => ({
  default: () => null,
}));

vi.mock('@/shared/ui/WorkspaceGate', () => ({
  WorkspaceGate: () => createElement('div', { 'data-testid': 'workspace-gate' }),
}));

vi.mock('@/domain/workspace/WorkspaceShellContext', () => ({
  useWorkspaceShellState: () => ({
    workspacePresentation: {
      pages: {
        inspector: {
          blocked: inspectorPageState.blocked,
        },
      },
    },
  }),
}));

vi.mock('@/domain/inspector/InspectorWorkspaceContext', () => ({
  useInspectorWorkspace: () => ({
    images: [],
    classLookupMap: new Map<string, unknown>(),
    selectedImageStableId: null,
    setSelectedImageStableId: vi.fn(),
    loadingImages: false,
    imageSearch: '',
    setImageSearch: vi.fn(),
    classSearch: '',
    setClassSearch: vi.fn(),
    filteredImages: [],
    selectedImage: null,
    currentClasses: [],
    filteredClasses: [],
    tabs: [],
    activeTabIndex: 0,
    setActiveTabIndex: vi.fn(),
    openTabForClass: vi.fn(),
    handleCloseTab: vi.fn(),
    activeTab: null,
    selectedClass: null,
    displayStaticFields: [],
    displayFields: [],
    activeRuntimeFieldError: null,
    isLoadingRuntimeFields: false,
    isGlobalSearchOpen: false,
    setGlobalSearchOpen: vi.fn(),
    globalSearchMode: 'classes',
    setGlobalSearchMode: vi.fn(),
    globalSearchQuery: '',
    setGlobalSearchQuery: vi.fn(),
    globalSearchResults: [],
    isGlobalSearching: false,
    handleGlobalSearchResultClick: vi.fn(),
    isReferenceOpen: false,
    setReferenceOpen: vi.fn(),
    referenceSearchMode: 'type',
    setReferenceSearchMode: vi.fn(),
    referenceTargetInput: '',
    setReferenceTargetInput: vi.fn(),
    referenceTargetError: null,
    referenceResults: [],
    isReferenceSearching: false,
    executeReferenceSearch: vi.fn(),
    handleReferenceResultClick: vi.fn(),
    setReferenceTargetFromClass: vi.fn(),
    handleAddClassToStudio: vi.fn(),
    pendingScrollImageStableId: null,
    pendingScrollClassStableId: null,
    clearPendingScrollTarget: vi.fn(),
  }),
}));

vi.mock('./useInspectorPageController', async () => {
  const ReactModule = await import('react');

  return {
    useInspectorPageController: () => {
      inspectorPageState.controllerHookSpy();
      const tabBarRef = ReactModule.useRef<HTMLDivElement | null>(null);
      const imageListRef = ReactModule.useRef<HTMLDivElement | null>(null);
      const classListRef = ReactModule.useRef<HTMLDivElement | null>(null);

      return {
        tabBarRef,
        imageListRef,
        classListRef,
      };
    },
  };
});

describe('InspectorPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    inspectorPageState.blocked = true;
    inspectorPageState.controllerHookSpy.mockReset();
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

  it('can transition from blocked gate to mounted content without hook-order errors', async () => {
    await act(async () => {
      root.render(createElement(InspectorPage));
    });

    expect(container.querySelector('[data-testid="workspace-gate"]')).not.toBeNull();
    expect(inspectorPageState.controllerHookSpy).not.toHaveBeenCalled();

    inspectorPageState.blocked = false;

    await expect(act(async () => {
      root.render(createElement(InspectorPage));
    })).resolves.toBeUndefined();

    expect(container.querySelector('[data-testid="workspace-gate"]')).toBeNull();
    expect(inspectorPageState.controllerHookSpy).toHaveBeenCalledTimes(1);
  });
});