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

function createReadyLifecycle() {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'ready' as const,
    hasSnapshot: true,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'ready' as const,
      bridgeConnected: true,
    },
  };
}

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
        lifecycle: createReadyLifecycle(),
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

  it('passes structured abort reasons into execution cleanup for reruns and workspace resets', () => {
    const cleanupSpy = vi.fn();
    executeStudioFlowMock.mockReturnValue(cleanupSpy);

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: createReadyLifecycle(),
      }));
    });

    act(() => {
      latestState?.state.executeFlow('node-1');
    });

    act(() => {
      latestState?.state.executeFlow('node-2');
    });

    expect(cleanupSpy).toHaveBeenCalledWith('rerun');

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: { ...EMPTY_WORKSPACE_LIFECYCLE, status: 'recovering', hasSnapshot: true, runtimeSession: { ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession, status: 'recovering', bridgeConnected: false } },
      }));
    });

    expect(cleanupSpy).toHaveBeenCalledWith('workspace-reset');
  });

  it('blocks execution and logs workspace diagnostics when the workspace is not ready', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'recovering',
          hasSnapshot: true,
          errorMessage: 'bridge helper disconnected',
          runtime: 'mono',
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'recovering',
            runtime: 'mono',
            bridgeConnected: false,
            lastError: 'bridge helper disconnected',
            sessionKey: 'session-1',
          },
        },
      }));
    });

    act(() => {
      latestState?.state.executeFlow('node-1');
    });

    expect(executeStudioFlowMock).not.toHaveBeenCalled();
    expect(latestState?.state.canExecuteFlow).toBe(false);
    expect(latestState?.state.executionBlockedReason).toBe('Workspace is not ready (recovering).');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[StudioWorkspaceExecution]', expect.objectContaining({
      reason: 'blocked',
      message: 'Workspace is not ready (recovering).',
      workspace: expect.objectContaining({
        status: 'recovering',
        hasSnapshot: true,
        errorMessage: 'bridge helper disconnected',
        runtimeSession: expect.objectContaining({
          status: 'recovering',
          bridgeConnected: false,
          lastError: 'bridge helper disconnected',
          sessionKey: 'session-1',
        }),
      }),
    }));

    consoleErrorSpy.mockRestore();
  });
});