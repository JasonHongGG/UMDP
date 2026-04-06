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
        capabilities: ['metadata', 'preview-query', 'execution', 'scene-catalog-read'],
        sceneObjectComponents: {
          status: 'supported',
          strategy: 'get-components-by-type',
          reason: null,
          checkedAt: '2026-04-06T12:00:00.000Z',
        },
        connected: true,
        sessionKey: 'session-1',
        lastError: null,
        lastHeartbeatAt: '12345',
      },
    };

    expect(state.runtimeSession.connected).toBe(true);
    expect(state.runtimeSession.capabilities).toContain('preview-query');
    expect(state.runtimeSession.sceneObjectComponents.status).toBe('supported');
    expect(state.runtimeSession.sessionKey).toBe('session-1');
    expect(state.resourceRevision).toBe(3);
  });
});