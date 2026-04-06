import { describe, expect, it } from 'vitest';
import { EMPTY_WORKSPACE_LIFECYCLE, getWorkspaceLifecycleLabel, getWorkspaceLifecycleTone } from './workspaceLifecycle';

describe('workspaceLifecycle shell helpers', () => {
  it('exposes a detached backend-first default lifecycle', () => {
    expect(EMPTY_WORKSPACE_LIFECYCLE).toEqual({
      resourceRevision: 0,
      status: 'detached',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: false,
      errorMessage: null,
      runtimeSession: {
        status: 'idle',
        runtime: 'unknown',
        capabilities: ['metadata'],
        connected: false,
        sessionKey: null,
        lastError: null,
        lastHeartbeatAt: null,
      },
    });
  });

  it('maps lifecycle states to stable labels and tones', () => {
    expect(getWorkspaceLifecycleLabel({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'runtime-error' })).toBe('Runtime Error');
    expect(getWorkspaceLifecycleTone({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'ready' })).toBe('ready');
    expect(getWorkspaceLifecycleTone({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'runtime-error' })).toBe('error');
    expect(getWorkspaceLifecycleTone({ ...EMPTY_WORKSPACE_LIFECYCLE, status: 'attached-without-snapshot' })).toBe('warning');
  });
});