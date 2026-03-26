// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeWrapper } from './NodeWrapper';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/features/studio/application/useStudioNodeWrapperState', () => ({
  useStudioNodeWrapperState: () => ({
    nodes: [{ id: 'node-1', type: 'wait', position: { x: 0, y: 0 }, data: {} }],
    updateNodePosition: vi.fn(),
    updateNodePositions: vi.fn(),
    beginNodePositionSession: vi.fn(),
    commitNodePositionSession: vi.fn(),
    deleteNode: vi.fn(),
    transform: { x: 0, y: 0, scale: 1 },
    openEditModal: vi.fn(),
    selectedNodeIds: [],
    selectSingleNode: vi.fn(),
    toggleSelectedNode: vi.fn(),
    registerNodeElement: vi.fn(),
  }),
}));

describe('NodeWrapper visibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it('renders aborted badge text instead of generic error when a node is cancelled', async () => {
    await act(async () => {
      root.render(
        createElement(
          NodeWrapper,
          {
            node: { id: 'node-1', type: 'wait', position: { x: 0, y: 0 }, data: {} },
            executionState: 'aborted',
            executionSnapshot: {
              nodeId: 'node-1',
              status: 'aborted',
              originKind: 'runtime',
              phase: 'execute',
              inputs: {},
              outputs: {},
              errorMessage: 'Execution aborted.',
              failureReason: 'aborted',
              abortReason: 'rerun',
            },
            children: createElement('div', null, 'Child'),
          },
        ),
      );
    });

    expect(container.textContent).toContain('Aborted (rerun)');
    expect(container.textContent).not.toContain('Error');
  });
});