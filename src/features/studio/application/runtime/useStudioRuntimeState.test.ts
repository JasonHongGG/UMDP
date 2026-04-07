// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useStudioRuntimeState } from './useStudioRuntimeState';
import type { GraphDocument } from '@/domain/studio/contracts';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { configureDiagnostics, getDiagnosticsBuffer, resetDiagnosticsStateForTests } from '@/shared/diagnostics';
import type { RuntimeCapability, WorkspaceLifecycleState } from '@/shared/contracts';

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

const ATTACHED_PROCESS = {
  pid: 1337,
  processName: 'Unity.exe',
  exePath: 'C:/Unity.exe',
  dataDir: null,
  managedDir: null,
  runtime: 'mono' as const,
};

const STUDIO_CAPABILITIES: RuntimeCapability[] = ['metadata', 'execution'];

function createReadyLifecycle(): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'ready' as const,
    hasSnapshot: true,
    processSession: ATTACHED_PROCESS,
    runtime: 'mono' as const,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'ready' as const,
      runtime: 'mono' as const,
      connected: true,
      capabilities: STUDIO_CAPABILITIES,
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
    resetDiagnosticsStateForTests();
    configureDiagnostics({
      clearBuffer: true,
      policy: {
        enabled: true,
        captureBuffer: true,
        consoleOutput: false,
        minimumLevel: 'debug',
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    resetDiagnosticsStateForTests();
  });

  it('clears runtime snapshots when a runtime error begins', () => {
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

    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'runtime-error',
          hasSnapshot: true,
          processSession: ATTACHED_PROCESS,
          runtime: 'mono' as const,
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'error',
            runtime: 'mono' as const,
            connected: false,
            capabilities: STUDIO_CAPABILITIES,
          },
        },
      }));
    });

    expect(latestState?.state.nodeStates).toEqual({});
    expect(latestState?.state.nodeSnapshots).toEqual({});
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
        lifecycle: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'runtime-error',
          hasSnapshot: true,
          processSession: ATTACHED_PROCESS,
          runtime: 'mono' as const,
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'error',
            runtime: 'mono' as const,
            connected: false,
            capabilities: STUDIO_CAPABILITIES,
          },
        },
      }));
    });

    expect(cleanupSpy).toHaveBeenCalledWith('workspace-reset');
  });

  it('blocks execution and logs workspace diagnostics when the workspace is not ready', () => {
    act(() => {
      root.render(createElement(HookHarness, {
        lifecycle: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'runtime-error',
          hasSnapshot: true,
          processSession: ATTACHED_PROCESS,
          errorMessage: 'runtime session disconnected',
          runtime: 'mono',
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'error',
            runtime: 'mono',
            connected: false,
            lastError: 'runtime session disconnected',
            sessionKey: 'session-1',
            capabilities: STUDIO_CAPABILITIES,
          },
        },
      }));
    });

    act(() => {
      latestState?.state.executeFlow('node-1');
    });

    expect(executeStudioFlowMock).not.toHaveBeenCalled();
    expect(latestState?.state.canExecuteFlow).toBe(false);
    expect(latestState?.state.executionBlockedReason).toBe('runtime session disconnected');
    expect(getDiagnosticsBuffer()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        channel: 'studio',
        origin: 'useStudioRuntimeState',
        message: 'Studio execution blocked.',
        context: expect.objectContaining({
          reason: 'blocked',
          message: 'runtime session disconnected',
          workspace: expect.objectContaining({
            status: 'runtime-error',
            hasSnapshot: true,
            systemState: 'runtime-error',
            errorMessage: 'runtime session disconnected',
            runtimeSession: expect.objectContaining({
              status: 'error',
              connected: false,
              lastError: 'runtime session disconnected',
              sessionKey: 'session-1',
            }),
          }),
        }),
      }),
    ]));
  });
});