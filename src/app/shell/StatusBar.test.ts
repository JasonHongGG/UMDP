// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBar } from './StatusBar';
import { EMPTY_WORKSPACE_LIFECYCLE } from './workspaceLifecycle';

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
    await act(async () => {
      root.render(createElement(StatusBar, {
        tasks: [],
        resetNotice: null,
        workspace: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'recovering',
          runtime: 'il2cpp',
          processSession: {
            pid: 1337,
            processName: 'Unity.exe',
            exePath: 'C:/Unity.exe',
            dataDir: null,
            managedDir: null,
            runtime: 'il2cpp',
          },
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'recovering',
            runtime: 'il2cpp',
            connected: false,
            lastError: 'runtime session disconnected',
          },
        },
      }));
    });

    expect(container.textContent).toContain('Recovering');
    expect(container.textContent).toContain('il2cpp Runtime');
    expect(container.textContent).toContain('Runtime Recovering');
    expect(container.textContent).toContain('runtime session disconnected');
  });

  it('prefers the active workspace task message over the runtime error', async () => {
    await act(async () => {
      root.render(createElement(StatusBar, {
        tasks: [
          {
            taskId: 'scene-refresh',
            resourceKind: 'scene',
            operationKey: 'scene.refresh',
            scope: 'resource',
            status: 'running',
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
        ],
        resetNotice: {
          kind: 'recovering',
          tone: 'error',
          title: 'Runtime Recovering',
          message: 'Resource state is rebuilding.',
        },
        workspace: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'recovering',
          runtime: 'il2cpp',
          processSession: {
            pid: 1337,
            processName: 'Unity.exe',
            exePath: 'C:/Unity.exe',
            dataDir: null,
            managedDir: null,
            runtime: 'il2cpp',
          },
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'recovering',
            runtime: 'il2cpp',
            connected: false,
            lastError: 'runtime session disconnected',
          },
        },
      }));
    });

    expect(container.textContent).toContain('Refreshing scene workspace (2/5)');
    expect(container.textContent).not.toContain('runtime session disconnected');
    expect(container.textContent).not.toContain('Resource state is rebuilding.');
  });

  it('shows shell reset notice before the process label when no task is active', async () => {
    await act(async () => {
      root.render(createElement(StatusBar, {
        tasks: [],
        resetNotice: {
          kind: 'session-changed',
          tone: 'warning',
          title: 'Workspace Reset',
          message: 'A new Unity session is active. Resource state is rebuilding.',
        },
        workspace: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'ready',
          hasSnapshot: true,
          processSession: {
            pid: 1337,
            processName: 'Unity.exe',
            exePath: 'C:/Unity.exe',
            dataDir: null,
            managedDir: null,
            runtime: 'mono',
          },
          runtime: 'mono',
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'ready',
            runtime: 'mono',
            connected: true,
            sessionKey: 'session-2',
          },
        },
      }));
    });

    expect(container.textContent).toContain('A new Unity session is active. Resource state is rebuilding.');
    expect(container.textContent).not.toContain('Unity.exe (1337)');
  });
});