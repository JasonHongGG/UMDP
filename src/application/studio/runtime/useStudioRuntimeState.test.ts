// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useStudioRuntimeState } from './useStudioRuntimeState';
import type { GraphDocument } from '../../../domain/studio/contracts';
import type { StudioRuntimeDataState } from '../../../core/studio/runtimeData';
import { EMPTY_WORKSPACE_LIFECYCLE } from '../../../app/shell/workspaceLifecycle';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const executeStudioFlowMock = vi.fn();

vi.mock('./executeStudioFlow', () => ({
  executeStudioFlow: (...args: unknown[]) => executeStudioFlowMock(...args),
}));

const DOCUMENT: GraphDocument = {
  schemaVersion: 1,
  id: 'doc-1',
  nodes: [],
  controlConnections: [],
  dataConnections: [],
};

const RUNTIME_DATA: StudioRuntimeDataState = {
  classes: [],
  classCatalog: {
    createNodeRequest: () => null,
    getByBinding: () => null,
    resolveStaticFieldAddress: () => null,
    resolveMemberValues: () => undefined,
    ensureOverlayLoaded: () => undefined,
    ensureInstanceFieldsLoaded: () => undefined,
  },
  expressions: {
    resolveSource: () => undefined,
  },
};

afterEach(() => {
  executeStudioFlowMock.mockReset();
});

interface HookSnapshot {
  state: ReturnType<typeof useStudioRuntimeState>;
}

let latestState: HookSnapshot | null = null;

function HookHarness({ lifecycle }: { lifecycle: typeof EMPTY_WORKSPACE_LIFECYCLE }) {
  latestState = {
    state: useStudioRuntimeState(DOCUMENT, [], [], RUNTIME_DATA, lifecycle),
  };

  return null;
}

describe('useStudioRuntimeState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestState = null;
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

  it('clears runtime snapshots and active run when workspace recovery begins', () => {
    executeStudioFlowMock.mockImplementation(({ onNodeStateChange, onNodeSnapshot, onRunStart, onRunComplete }) => {
      onNodeStateChange('node-1', 'success');
      onNodeSnapshot({
        nodeId: 'node-1',
        status: 'success',
        originKind: 'runtime',
        phase: 'execute',
        inputs: {},
        outputs: {},
        progress: null,
      });
      onRunStart({ runId: 'run-1', startNodeId: 'node-1', startedAt: 1, status: 'running' });
      onRunComplete({ runId: 'run-1', startNodeId: 'node-1', startedAt: 1, completedAt: 2, status: 'success' });
      return vi.fn();
    });

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: { ...EMPTY_WORKSPACE_LIFECYCLE, status: 'ready', hasSnapshot: true, runtimeSession: { ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession, status: 'ready', bridgeConnected: true } },
      }));
    });

    act(() => {
      latestState?.state.executeFlow('node-1');
    });

    expect(latestState?.state.nodeStates['node-1']).toBe('success');
    expect(latestState?.state.nodeSnapshots['node-1']?.status).toBe('success');
    expect(latestState?.state.activeRun?.runId).toBe('run-1');
    expect(latestState?.state.runHistory).toHaveLength(1);

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: { ...EMPTY_WORKSPACE_LIFECYCLE, status: 'recovering', hasSnapshot: true, runtimeSession: { ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession, status: 'recovering', bridgeConnected: false } },
      }));
    });

    expect(latestState?.state.nodeStates).toEqual({});
    expect(latestState?.state.nodeSnapshots).toEqual({});
    expect(latestState?.state.activeRun).toBeNull();
  });
});