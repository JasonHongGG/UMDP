import { describe, expect, it } from 'vitest';
import { EMPTY_WORKSPACE_LIFECYCLE, getWorkspaceLifecycleLabel, getWorkspaceLifecycleTone } from './workspaceLifecycle';

describe('workspaceLifecycle shell helpers', () => {
  it('exposes a detached backend-first default lifecycle', () => {
    expect(EMPTY_WORKSPACE_LIFECYCLE).toEqual({
      status: 'detached',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: false,
      errorMessage: null,
      runtimeSession: {
        status: 'idle',
        runtime: 'unknown',
        capabilities: ['metadata'],
        bridgeConnected: false,
        sessionKey: null,
        lastError: null,
        lastHeartbeatAt: null,
      },
    });
  });

  it('maps lifecycle states to stable labels and tones', () => {
    expect(getWorkspaceLifecycleLabel({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'recovering' })).toBe('Recovering');
    expect(getWorkspaceLifecycleLabel({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'bridge-error' })).toBe('Bridge Error');
    expect(getWorkspaceLifecycleTone({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'ready' })).toBe('ready');
    expect(getWorkspaceLifecycleTone({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'attached-without-snapshot' })).toBe('warning');
  });
});