// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useStudioUiState } from './studioUiState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latestState: ReturnType<typeof useStudioUiState> | null = null;

function HookHarness() {
  latestState = useStudioUiState({
    nodes: [{ id: 'node-1', type: 'display', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    connectPorts: () => undefined,
  });

  return null;
}

describe('useStudioUiState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestState = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(createElement(HookHarness));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('delegates selection and editor state through the canvas reducer', () => {
    act(() => {
      latestState?.setSelectedNodeIds(['node-1', 'node-1']);
      latestState?.openEditModal('node-1');
    });

    expect(latestState?.selectedNodeIds).toEqual(['node-1']);
    expect(latestState?.isEditModalOpen).toBe(true);
    expect(latestState?.editingNodeId).toBe('node-1');

    act(() => {
      latestState?.closeEditModal();
    });

    expect(latestState?.isEditModalOpen).toBe(false);
    expect(latestState?.editingNodeId).toBeNull();
  });

  it('delegates draft connections and add modal state through the canvas reducer', () => {
    act(() => {
      latestState?.openAddModal(12, 24);
      latestState?.startConnection('node-1', 'out', 'json', 'source', { x: 10, y: 20 });
      latestState?.updateConnectionTarget({ x: 30, y: 40 }, 'node-2', 'in', true);
    });

    expect(latestState?.isAddModalOpen).toBe(false);
    expect(latestState?.draftConnection).toEqual({
      sourceNodeId: 'node-1',
      sourcePortId: 'out',
      sourcePortType: 'json',
      sourceConnectionChannel: 'data',
      sourceHandleType: 'source',
      targetPos: { x: 30, y: 40 },
      hoveredTargetNodeId: 'node-2',
      hoveredTargetPortId: 'in',
      hoveredTargetCompatible: true,
    });

    act(() => {
      latestState?.cancelConnection();
      latestState?.openAddModal(12, 24);
    });

    expect(latestState?.draftConnection).toBeNull();
    expect(latestState?.isAddModalOpen).toBe(true);
    expect(latestState?.addModalPosition).toEqual({ x: 12, y: 24 });
  });
});