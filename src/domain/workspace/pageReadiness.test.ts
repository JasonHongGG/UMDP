import { describe, expect, it } from 'vitest';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import type { RuntimeCapability } from '@/shared/contracts';
import {
  createWorkspacePageReadinessMap,
  describeWorkspaceResetNotice,
} from '@/domain/workspace/pageReadiness';

const SCENE_PAGE_CAPABILITIES: RuntimeCapability[] = [
  'metadata',
  'scene-catalog-read',
  'scene-object-header-read',
  'scene-object-children-read',
  'execution',
];

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
        capabilities: SCENE_PAGE_CAPABILITIES,
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

  it('keeps scene selection ready when components are unsupported for the session', () => {
    const readyWithoutComponents = createWorkspacePageReadinessMap({
      ...EMPTY_WORKSPACE_LIFECYCLE,
      status: 'ready',
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
        status: 'ready',
        runtime: 'mono' as const,
        connected: true,
        capabilities: SCENE_PAGE_CAPABILITIES,
        sceneObjectComponents: {
          status: 'unsupported',
          strategy: null,
          reason: 'Component materialization is unavailable for this runtime session.',
          checkedAt: '2026-04-06T12:00:00.000Z',
        },
      },
    });

    expect(readyWithoutComponents.scene.selectionReady).toBe(true);
    expect(readyWithoutComponents.scene.capabilityAvailable).toBe(true);
  });

  it('detects session change and runtime error reset notices', () => {
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
      status: 'runtime-error',
      errorMessage: 'runtime session dropped',
      runtimeSession: {
        ...nextReady.runtimeSession,
        status: 'error',
        connected: false,
        lastError: 'runtime session dropped',
      },
    }, 'session-2')?.kind).toBe('runtime-error');
  });
});