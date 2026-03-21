// @vitest-environment jsdom

import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NodeWrapper } from '../../components/studio/canvas/NodeWrapper';
import WaitNodeDef from './WaitNode';

const openEditModal = vi.fn();

vi.mock('../../components/studio/canvas/Port', () => ({
  Port: () => null,
}));

vi.mock('../../core/studio/StudioContext', () => ({
  useStudioRuntime: () => ({
    nodeStates: {
      'wait-1': 'running',
    },
    nodeSnapshots: {
      'wait-1': {
        nodeId: 'wait-1',
        status: 'running',
        originKind: 'runtime',
        phase: 'execute',
        inputs: {},
        outputs: {},
        progress: {
          kind: 'countdown',
          displayText: '0.2s',
          totalMs: 200,
          remainingMs: 200,
        },
      },
    },
  }),
  useStudioGraph: () => ({
    nodes: [{ id: 'wait-1', type: 'wait', position: { x: 0, y: 0 }, data: { delaySeconds: 0.2 } }],
    updateNodePosition: vi.fn(),
    updateNodePositions: vi.fn(),
    beginNodePositionSession: vi.fn(),
    commitNodePositionSession: vi.fn(),
    deleteNode: vi.fn(),
  }),
  useStudioUi: () => ({
    transform: { x: 0, y: 0, scale: 1 },
    openEditModal,
    selectedNodeIds: [],
    selectSingleNode: vi.fn(),
    toggleSelectedNode: vi.fn(),
    registerNodeElement: vi.fn(),
  }),
}));

describe('WaitNode Canvas', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openEditModal.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('renders countdown text in running state and keeps double click opening the edit modal', async () => {
    await act(async () => {
      root.render(
        <NodeWrapper node={{ id: 'wait-1', type: 'wait', position: { x: 0, y: 0 }, data: { delaySeconds: 0.2 } }}>
          <WaitNodeDef.CanvasComponent
            id="wait-1"
            data={{ delaySeconds: 0.2 }}
            inputs={[]}
            outputs={[]}
          />
        </NodeWrapper>,
      );
    });

    const countdown = container.querySelector('span');
    expect(container.textContent).toContain('0.2s');

    await act(async () => {
      countdown?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(openEditModal).toHaveBeenCalledWith('wait-1');
  });
});