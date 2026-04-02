import { describe, expect, it } from 'vitest';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import type { RuntimeCapability } from '@/shared/contracts';
import {
  createWorkspacePageReadinessMap,
  describeWorkspaceResetNotice,
} from './pageReadiness';

describe('workspace page readiness', () => {
  it('gates scene and studio behind session, catalog, and runtime readiness', () => {
    const base = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
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
        runtime: 'mono' as const,
        capabilities: ['metadata', 'scene-read', 'execution'] as RuntimeCapability[],
      },
    };

    const attached = createWorkspacePageReadinessMap({
      ...base,
      status: 'attached-without-snapshot',
      hasSnapshot: false,
    });
    expect(attached.scene.sessionReady).toBe(true);
    expect(attached.scene.catalogReady).toBe(false);
    expect(attached.scene.selectionReady).toBe(false);

    const catalogLoaded = createWorkspacePageReadinessMap({
      ...base,
      status: 'ready',
      hasSnapshot: true,
      runtimeSession: {
        ...base.runtimeSession,
        status: 'starting',
        connected: false,
      },
    });
    expect(catalogLoaded.inspector.selectionReady).toBe(true);
    expect(catalogLoaded.scene.catalogReady).toBe(true);
    expect(catalogLoaded.scene.selectionReady).toBe(false);

    const fullyReady = createWorkspacePageReadinessMap({
      ...base,
      status: 'ready',
      hasSnapshot: true,
      runtimeSession: {
        ...base.runtimeSession,
        status: 'ready',
        connected: true,
      },
    });
    expect(fullyReady.scene.selectionReady).toBe(true);
    expect(fullyReady.studio.selectionReady).toBe(true);
  });

  it('detects session change and recovering reset notices', () => {
    const nextReady = {
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'ready' as const,
      hasSnapshot: true,
      processSession: {
        pid: 2,
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

    expect(describeWorkspaceResetNotice(nextReady, 'session-1')?.kind).toBe('session-changed');
    expect(describeWorkspaceResetNotice({
      ...nextReady,
      status: 'recovering',
      errorMessage: 'runtime session dropped',
    }, 'session-2')?.kind).toBe('recovering');
  });
});