// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBar } from './StatusBar';
import { EMPTY_WORKSPACE_LIFECYCLE } from './workspaceLifecycle';
import { createWorkspaceKernelState, createWorkspacePresentation } from '@/kernel/workspace/derive';
import type { WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';

function createPresentation(workspace: WorkspaceLifecycleState, tasks: WorkspaceTaskSnapshot[] = []) {
  return createWorkspacePresentation(createWorkspaceKernelState({
    processSession: workspace.processSession,
    contractVersions: null,
    workspaceLifecycle: workspace,
    activePage: 'scene',
    workspaceTasks: tasks,
    previousLifecycle: null,
  }));
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('StatusBar', () => {
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

  it('renders runtime flavor and recovering session text from workspace lifecycle', async () => {
    const workspace = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'recovering' as const,
      runtime: 'il2cpp' as const,
      processSession: {
        pid: 1337,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: null,
        managedDir: null,
        runtime: 'il2cpp' as const,
      },
      runtimeSession: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
        status: 'recovering' as const,
        runtime: 'il2cpp' as const,
        connected: false,
        lastError: 'runtime session disconnected',
      },
    };

    await act(async () => {
      root.render(createElement(StatusBar, {
        presentation: createPresentation(workspace),
      }));
    });

    expect(container.textContent).toContain('Recovering');
    expect(container.textContent).toContain('il2cpp Runtime');
    expect(container.textContent).toContain('Runtime Recovering');
    expect(container.textContent).toContain('runtime session disconnected');
  });

  it('prefers the active workspace task message over the runtime error', async () => {
    const tasks: WorkspaceTaskSnapshot[] = [
      {
        taskId: 'scene-refresh',
        resourceKind: 'scene',
        operationKey: 'scene.refresh',
        scope: 'resource',
        status: 'running' as const,
        progress: {
          completed: 2,
          total: 5,
          message: 'Refreshing scene workspace',
        },
        targetId: null,
        startedAt: '2026-03-30T16:00:00.000Z',
        updatedAt: '2026-03-30T16:00:05.000Z',
        errorMessage: null,
      },
    ];
    const workspace = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'recovering' as const,
      runtime: 'il2cpp' as const,
      processSession: {
        pid: 1337,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: null,
        managedDir: null,
        runtime: 'il2cpp' as const,
      },
      runtimeSession: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
        status: 'recovering' as const,
        runtime: 'il2cpp' as const,
        connected: false,
        lastError: 'runtime session disconnected',
      },
    };

    await act(async () => {
      root.render(createElement(StatusBar, {
        presentation: createPresentation(workspace, tasks),
      }));
    });

    expect(container.textContent).toContain('Refreshing scene workspace (2/5)');
    expect(container.textContent).not.toContain('runtime session disconnected');
    expect(container.textContent).not.toContain('Resource state is rebuilding.');
  });

  it('shows shell reset notice before the process label when no task is active', async () => {
    const previousWorkspace = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'ready' as const,
      hasSnapshot: true,
      processSession: {
        pid: 1001,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: null,
        managedDir: null,
        runtime: 'mono' as const,
      },
      runtime: 'mono' as const,
      runtimeSession: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
        status: 'ready' as const,
        runtime: 'mono' as const,
        connected: true,
        sessionKey: 'session-1',
      },
    };
    const workspace = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'ready' as const,
      hasSnapshot: true,
      processSession: {
        pid: 1337,
        processName: 'Unity.exe',
        exePath: 'C:/Unity.exe',
        dataDir: null,
        managedDir: null,
        runtime: 'mono' as const,
      },
      runtime: 'mono' as const,
      runtimeSession: {
        ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
        status: 'ready' as const,
        runtime: 'mono' as const,
        connected: true,
        sessionKey: 'session-2',
      },
    };

    await act(async () => {
      root.render(createElement(StatusBar, {
        presentation: createWorkspacePresentation(createWorkspaceKernelState({
          processSession: workspace.processSession,
          contractVersions: null,
          workspaceLifecycle: workspace,
          activePage: 'scene',
          workspaceTasks: [],
          previousLifecycle: previousWorkspace,
        })),
      }));
    });

    expect(container.textContent).toContain('A new Unity session is active. Scene, Studio, and runtime caches are being rebuilt for the new process.');
    expect(container.textContent).not.toContain('Unity.exe (1337)');
  });
});