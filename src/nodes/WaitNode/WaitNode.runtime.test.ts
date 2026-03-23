// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NodeWrapper } from '../../components/studio/canvas/NodeWrapper';
import { executeStudioFlow } from '../../application/studio/runtime/executeStudioFlow';
import { initializeStudioNodeRegistry } from '../../core/studio/NodeRegistry';
import type { StudioNodeDefinition } from '../../core/studio/types';
import WaitNodeDef from './WaitNode';

const openEditModal = vi.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../components/studio/canvas/Port', () => ({
  Port: () => null,
}));

vi.mock('../../application/studio/useStudioRuntimeViewState', () => ({
  useStudioRuntimeViewState: () => ({
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
}));

vi.mock('../../application/studio/useStudioNodeWrapperState', () => ({
  useStudioNodeWrapperState: () => ({
    nodes: [{ id: 'wait-1', type: 'wait', position: { x: 0, y: 0 }, data: { delaySeconds: 0.2 } }],
    updateNodePosition: vi.fn(),
    updateNodePositions: vi.fn(),
    beginNodePositionSession: vi.fn(),
    commitNodePositionSession: vi.fn(),
    deleteNode: vi.fn(),
    transform: { x: 0, y: 0, scale: 1 },
    openEditModal,
    selectedNodeIds: [],
    selectSingleNode: vi.fn(),
    toggleSelectedNode: vi.fn(),
    registerNodeElement: vi.fn(),
  }),
}));

describe('WaitNode runtime', () => {
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
        createElement(
          NodeWrapper,
          {
            node: { id: 'wait-1', type: 'wait', position: { x: 0, y: 0 }, data: { delaySeconds: 0.2 } },
            children: createElement(WaitNodeDef.CanvasComponent, {
              id: 'wait-1',
              data: { delaySeconds: 0.2 },
              inputs: [],
              outputs: [],
            }),
          },
        ),
      );
    });

    const countdown = container.querySelector('span');
    expect(container.textContent).toContain('0.2s');

    await act(async () => {
      countdown?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(openEditModal).toHaveBeenCalledWith('wait-1');
  });

  it('executes trigger -> wait -> sink and continues after the configured delay', async () => {
    vi.useFakeTimers();

    const sinkSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));
    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: { validate: () => [], execute: () => ({ state: 'success', outputs: {} }) },
      CanvasComponent: () => null,
    };

    const sinkNode: StudioNodeDefinition = {
      manifest: {
        type: 'sink',
        typeVersion: 1,
        family: 'control',
        displayName: 'Sink',
        description: 'Sink',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: { validate: () => [], execute: sinkSpy },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, WaitNodeDef, sinkNode]);

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'wait-1', type: 'wait', position: { x: 120, y: 0 }, data: { delaySeconds: 0.2 } },
        { id: 'sink-1', type: 'sink', position: { x: 240, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-wait', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'wait-1', targetPortId: 'flow-in' },
        { id: 'edge-wait-sink', channel: 'control', sourceNodeId: 'wait-1', sourcePortId: 'flow-out', targetNodeId: 'sink-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 0,
    });

    await vi.runAllTimersAsync();

    expect(sinkSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fail the wait when progress publication throws', async () => {
    vi.useFakeTimers();
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    initializeStudioNodeRegistry([WaitNodeDef]);

    const snapshots: Array<{ status: string }> = [];
    executeStudioFlow({
      startNodeId: 'wait-1',
      nodes: [
        { id: 'wait-1', type: 'wait', position: { x: 0, y: 0 }, data: { delaySeconds: 0.2 } },
      ],
      edges: [],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        if (snapshot.status === 'running' && snapshot.progress) {
          throw new Error('render failed');
        }

        snapshots.push({ status: snapshot.status });
      },
      stepDelayMs: 0,
    });

    await vi.runAllTimersAsync();

    expect(snapshots).toContainEqual({ status: 'success' });
    expect(consoleLogSpy).toHaveBeenCalledWith('[StudioFrontendError]', expect.objectContaining({
      nodeType: 'wait',
      phase: 'execute',
      reason: 'execution-error',
      message: 'Wait node progress reporting failed.',
    }));

    consoleLogSpy.mockRestore();
  });
});