// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasCore } from './CanvasCore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openAddModal = vi.fn();
const registerCanvasElement = vi.fn();
const clearSelectedNodes = vi.fn();
const setSelectedNodeIds = vi.fn();
const setTransform = vi.fn();
const beginCanvasPan = vi.fn();
const updateCanvasPan = vi.fn();
const beginMarqueeSelection = vi.fn();
const updateMarqueeSelection = vi.fn();
const endCanvasInteraction = vi.fn();

vi.mock('@/features/studio/application/useStudioCanvasState', () => ({
  useStudioCanvasState: () => ({
    nodes: [],
    canvasMode: { kind: 'idle' },
    transform: { x: 10, y: 20, scale: 2 },
    setTransform,
    openAddModal,
    registerCanvasElement,
    clearSelectedNodes,
    setSelectedNodeIds,
    getNodeElement: vi.fn(),
    beginCanvasPan,
    updateCanvasPan,
    beginMarqueeSelection,
    updateMarqueeSelection,
    endCanvasInteraction,
  }),
}));

vi.mock('./NodeLayer', () => ({ NodeLayer: () => React.createElement('div', { 'data-testid': 'node-layer' }) }));
vi.mock('./EdgeLayer', () => ({ EdgeLayer: () => React.createElement('div', { 'data-testid': 'edge-layer' }) }));

describe('CanvasCore', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    openAddModal.mockReset();
    registerCanvasElement.mockReset();
    clearSelectedNodes.mockReset();
    setSelectedNodeIds.mockReset();
    setTransform.mockReset();
    beginCanvasPan.mockReset();
    updateCanvasPan.mockReset();
    beginMarqueeSelection.mockReset();
    updateMarqueeSelection.mockReset();
    endCanvasInteraction.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('opens the add-node modal using canvas coordinates on double click', async () => {
    await act(async () => {
      root.render(React.createElement(CanvasCore));
    });

    const canvas = container.firstElementChild as HTMLDivElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 200, right: 900, bottom: 700, width: 800, height: 500 }),
    });

    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: 210,
        clientY: 320,
      }));
    });

    expect(openAddModal).toHaveBeenCalledWith(50, 50);
  });
});