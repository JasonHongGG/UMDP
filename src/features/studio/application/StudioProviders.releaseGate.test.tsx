// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { studioNodeCatalog } from '@/features/studio/nodes';
import { initializeStudioNodeRegistry } from '@/features/studio/core/NodeRegistry';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import { useStudioRuntime } from '@/features/studio/core/StudioContext';
import { StudioProviders } from './StudioProviders';
import { useStudioFeedback, type StudioFeedbackMessage } from './feedback/StudioFeedbackContext';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const executeStudioFlowMock = vi.fn();

vi.mock('./runtime/executeStudioFlow', () => ({
  executeStudioFlow: (...args: unknown[]) => executeStudioFlowMock(...args),
}));

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

interface StudioProviderSnapshot {
  canExecuteFlow: boolean;
  executionBlockedReason: string | null;
  documentFeedback: StudioFeedbackMessage | null;
  runtimeFeedback: StudioFeedbackMessage | null;
}

let latestState: StudioProviderSnapshot | null = null;
let executeFlow: ((startNodeId: string) => void) | null = null;

function createReadyLifecycle(): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'ready',
    hasSnapshot: true,
    runtime: 'mono',
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'ready',
      runtime: 'mono',
      connected: true,
      sessionKey: 'session-1',
      capabilities: ['metadata', 'execution'],
    },
  };
}

function createRecoveringLifecycle(): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'recovering',
    hasSnapshot: true,
    runtime: 'mono',
    errorMessage: 'runtime session disconnected',
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'recovering',
      runtime: 'mono',
      connected: false,
      lastError: 'runtime session disconnected',
      sessionKey: 'session-1',
      capabilities: ['metadata', 'execution'],
    },
  };
}

function createRuntimeErrorLifecycle(): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'runtime-error',
    hasSnapshot: true,
    runtime: 'mono',
    errorMessage: 'runtime session failed to initialize',
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'error',
      runtime: 'mono',
      connected: false,
      lastError: 'runtime session failed to initialize',
      sessionKey: 'session-9',
      capabilities: ['metadata', 'execution'],
    },
  };
}

function TestConsumer() {
  const runtime = useStudioRuntime();
  const feedback = useStudioFeedback();

  executeFlow = runtime.executeFlow;
  latestState = {
    canExecuteFlow: runtime.canExecuteFlow,
    executionBlockedReason: runtime.executionBlockedReason,
    documentFeedback: feedback.documentFeedback,
    runtimeFeedback: feedback.runtimeFeedback,
  };

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('StudioProviders release gates', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    initializeStudioNodeRegistry(studioNodeCatalog);
    executeStudioFlowMock.mockReset();
    latestState = null;
    executeFlow = null;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    initializeStudioNodeRegistry([]);
  });

  it('reports execution reset feedback when the workspace drops into recovery mid-run', async () => {
    const cleanupSpy = vi.fn();
    executeStudioFlowMock.mockReturnValue(cleanupSpy);

    await act(async () => {
      root.render(createElement(StudioProviders, {
        runtimeData: RUNTIME_DATA,
        workspaceLifecycle: createReadyLifecycle(),
        children: createElement(TestConsumer),
      }));
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      canExecuteFlow: true,
      executionBlockedReason: null,
      documentFeedback: null,
      runtimeFeedback: null,
    });

    await act(async () => {
      executeFlow?.('trigger-1');
    });
    await flushEffects();

    expect(executeStudioFlowMock).toHaveBeenCalledOnce();
    expect(latestState?.documentFeedback).toMatchObject({
      tone: 'info',
      title: 'Execution Active',
      description: 'Executing workflow from trigger-1.',
    });
    expect(latestState?.runtimeFeedback).toBeNull();

    await act(async () => {
      root.render(createElement(StudioProviders, {
        runtimeData: RUNTIME_DATA,
        workspaceLifecycle: createRecoveringLifecycle(),
        children: createElement(TestConsumer),
      }));
    });
    await flushEffects();

    expect(cleanupSpy).toHaveBeenCalledWith('workspace-reset');
    expect(latestState).toMatchObject({
      canExecuteFlow: false,
      executionBlockedReason: 'Workspace is not ready (recovering).',
    });
    expect(latestState?.documentFeedback).toMatchObject({
      tone: 'warning',
      title: 'Studio Runtime Locked',
      description: 'Workspace is not ready (recovering).',
    });
    expect(latestState?.runtimeFeedback).toMatchObject({
      tone: 'warning',
      title: 'Execution Reset',
      description: 'Workspace is not ready (recovering).',
    });
  });

  it('reports blocked runtime feedback when execution is attempted during a runtime error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      root.render(createElement(StudioProviders, {
        runtimeData: RUNTIME_DATA,
        workspaceLifecycle: createRuntimeErrorLifecycle(),
        children: createElement(TestConsumer),
      }));
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      canExecuteFlow: false,
      executionBlockedReason: 'Workspace is not ready (runtime-error).',
    });
    expect(latestState?.documentFeedback).toMatchObject({
      tone: 'warning',
      title: 'Studio Runtime Locked',
      description: 'Workspace is not ready (runtime-error).',
    });
    expect(latestState?.runtimeFeedback).toBeNull();

    await act(async () => {
      executeFlow?.('trigger-runtime-error');
    });
    await flushEffects();

    expect(executeStudioFlowMock).not.toHaveBeenCalled();
    expect(latestState?.runtimeFeedback).toMatchObject({
      tone: 'error',
      title: 'Execution Blocked',
      description: 'Workspace is not ready (runtime-error).',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[StudioWorkspaceExecution]', expect.objectContaining({
      reason: 'blocked',
      message: 'Workspace is not ready (runtime-error).',
      workspace: expect.objectContaining({
        status: 'runtime-error',
        errorMessage: 'runtime session failed to initialize',
        runtimeSession: expect.objectContaining({
          status: 'error',
          connected: false,
          lastError: 'runtime session failed to initialize',
          sessionKey: 'session-9',
        }),
      }),
    }));

    consoleErrorSpy.mockRestore();
  });
});