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
            bridgeConnected: false,
            lastError: 'bridge helper disconnected',
          },
        },
      }));
    });

    expect(container.textContent).toContain('Recovering');
    expect(container.textContent).toContain('il2cpp Runtime');
    expect(container.textContent).toContain('Runtime Recovering');
    expect(container.textContent).toContain('bridge helper disconnected');
  });
});