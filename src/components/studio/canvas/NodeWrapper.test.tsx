// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeWrapper } from './NodeWrapper';

vi.mock('../../../core/studio/StudioContext', () => ({
  useStudioGraph: () => ({
    nodes: [{ id: 'node-1', type: 'wait', position: { x: 0, y: 0 }, data: {} }],
    updateNodePosition: vi.fn(),
    updateNodePositions: vi.fn(),
    beginNodePositionSession: vi.fn(),
    commitNodePositionSession: vi.fn(),
    deleteNode: vi.fn(),
  }),
  useStudioUi: () => ({
    transform: { x: 0, y: 0, scale: 1 },
    openEditModal: vi.fn(),
    selectedNodeIds: [],
    selectSingleNode: vi.fn(),
    toggleSelectedNode: vi.fn(),
    registerNodeElement: vi.fn(),
  }),
}));

describe('NodeWrapper', () => {
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
        <NodeWrapper
          node={{ id: 'node-1', type: 'wait', position: { x: 0, y: 0 }, data: {} }}
          executionState="aborted"
          executionSnapshot={{
            nodeId: 'node-1',
            status: 'aborted',
            originKind: 'runtime',
            phase: 'execute',
            inputs: {},
            outputs: {},
            errorMessage: 'Execution aborted.',
            failureReason: 'aborted',
            abortReason: 'rerun',
          }}
        >
          <div>Child</div>
        </NodeWrapper>,
      );
    });

    expect(container.textContent).toContain('Aborted (rerun)');
    expect(container.textContent).not.toContain('Error');
  });
});