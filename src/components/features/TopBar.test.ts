// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { TopBar } from './TopBar';
import { EMPTY_WORKSPACE_LIFECYCLE } from '../../app/shell/workspaceLifecycle';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../infrastructure/tauri/TauriWindowGateway', () => ({
  closeCurrentWindow: vi.fn().mockResolvedValue(undefined),
  minimizeCurrentWindow: vi.fn().mockResolvedValue(undefined),
  toggleCurrentWindowMaximized: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./TopNavigation', () => ({
  TopNavigation: () => null,
}));

describe('TopBar', () => {
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

  it('shows the attached process name and pid without restoring runtime and contract badges', async () => {
    await act(async () => {
      root.render(createElement(TopBar, {
        onOpenSelector: () => undefined,
        activePage: 'studio',
        onPageChange: () => undefined,
        workspace: {
          ...EMPTY_WORKSPACE_LIFECYCLE,
          status: 'ready',
          runtime: 'mono',
          processSession: {
            pid: 1337,
            processName: 'Unity.exe',
            exePath: 'C:/Unity.exe',
            dataDir: null,
            managedDir: null,
            runtime: 'mono',
          },
          runtimeSession: {
            ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
            status: 'ready',
            runtime: 'mono',
            bridgeConnected: true,
          },
        },
      }));
    });

    expect(container.textContent).toContain('Workspace');
    expect(container.textContent).toContain('Unity.exe (1337)');
    expect(container.textContent).not.toContain('Runtime ready');
    expect(container.textContent).not.toContain('Contracts T1/B2/A1/W1');
  });
});