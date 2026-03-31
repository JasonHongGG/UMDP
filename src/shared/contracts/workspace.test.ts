import { describe, expect, it } from 'vitest';
import type { WorkspaceLifecycleState } from './workspace';

describe('workspace contracts', () => {
  it('supports the runtime session fields required by the workbench shell', () => {
    const state: WorkspaceLifecycleState = {
      resourceRevision: 3,
      status: 'ready',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: true,
      errorMessage: null,
      runtimeSession: {
        status: 'ready',
        runtime: 'unknown',
        capabilities: ['metadata', 'preview-query', 'execution'],
        bridgeConnected: true,
        sessionKey: 'session-1',
        lastError: null,
        lastHeartbeatAt: '12345',
      },
    };

    expect(state.runtimeSession.bridgeConnected).toBe(true);
    expect(state.runtimeSession.capabilities).toContain('preview-query');
    expect(state.runtimeSession.sessionKey).toBe('session-1');
    expect(state.resourceRevision).toBe(3);
  });
});