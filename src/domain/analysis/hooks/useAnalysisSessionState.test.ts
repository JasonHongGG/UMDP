// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession, SceneWorkspaceState } from '../contracts';
import type { WorkspaceAttachIntentChannel } from '@/domain/workspace/ports/WorkspaceAttachIntentChannel';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { configureDiagnostics, getDiagnosticsBuffer, resetDiagnosticsStateForTests } from '@/shared/diagnostics';
import { useAnalysisSessionState } from './useAnalysisSessionState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let processSelectedHandler: ((process: ProcessInfo) => void | Promise<void>) | null = null;
const disposeAttachIntent = vi.fn();

const EMPTY_SCENE_WORKSPACE_STATE: SceneWorkspaceState = {
  resourceRevision: 0,
  sessionKey: null,
  refreshStatus: 'idle',
  errorMessage: null,
  mutationEpoch: 0,
  snapshot: null,
  lastUpdatedAt: null,
  resourceState: {
    resourceKind: 'catalog',
    resourceRevision: 0,
    sessionKey: null,
    freshness: 'empty',
    lastSuccessfulAt: null,
    isRetainingSnapshot: false,
    errorMessage: null,
  },
};

const EMPTY_SCENE_MUTATION_RESULT = {
  operation: 'set-active' as const,
  sceneHandle: null,
  targetObjectAddress: null,
  parentObjectAddress: null,
  object: null,
  deletedObjectAddress: null,
  preferredSelectionAddress: null,
  activeSelf: null,
  transform: null,
};

interface HookSnapshot {
  processSession: ProcessSession | null;
  attachError: string | null;
  analysisSnapshot: AnalysisSnapshot | null;
  loadingImages: boolean;
  workspaceLifecycle: WorkspaceLifecycleState;
}

let latestState: HookSnapshot | null = null;

function createLifecycle(overrides: Partial<WorkspaceLifecycleState> = {}): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    ...overrides,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      ...overrides.runtimeSession,
    },
  };
}

function createRepository(overrides: Partial<AnalysisRepository> = {}): AnalysisRepository {
  return {
    attachToProcess: vi.fn(),
    getContractVersions: vi.fn(),
    getWorkspaceLifecycle: vi.fn().mockResolvedValue(createLifecycle()),
    loadAllMetadata: vi.fn(),
    getRuntimeStaticFields: vi.fn(),
    getRuntimeInstanceFields: vi.fn(),
    startSceneRefresh: vi.fn().mockResolvedValue(EMPTY_SCENE_WORKSPACE_STATE),
    getSceneWorkspaceState: vi.fn().mockResolvedValue(EMPTY_SCENE_WORKSPACE_STATE),
    getSceneObjectChildren: vi.fn(),
    startSceneObjectChildrenAnalysis: vi.fn(),
    getSceneObjectChildrenState: vi.fn(),
    cancelSceneObjectChildrenAnalysis: vi.fn(),
    getSceneObjectInspector: vi.fn(),
    startSceneObjectInspectorAnalysis: vi.fn(),
    getSceneObjectInspectorState: vi.fn(),
    cancelSceneObjectInspectorAnalysis: vi.fn(),
    createSceneChild: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    duplicateSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    deleteSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectActive: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectTransform: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    createSceneComponent: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    deleteSceneComponent: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    ...overrides,
  } as AnalysisRepository;
}

function createAttachIntentChannel(): WorkspaceAttachIntentChannel {
  return {
    openProcessSelector: vi.fn().mockResolvedValue(undefined),
    onAttachIntent: vi.fn(async (handler: (process: ProcessInfo) => void | Promise<void>) => {
      processSelectedHandler = handler;
      return disposeAttachIntent;
    }),
  };
}

function HookHarness({
  repository,
  onResetWorkspace,
  attachIntentChannel,
}: {
  repository: AnalysisRepository;
  onResetWorkspace: () => void;
  attachIntentChannel: WorkspaceAttachIntentChannel;
}) {
  const state = useAnalysisSessionState({ repository, onResetWorkspace, attachIntentChannel });

  latestState = {
    processSession: state.processSession,
    attachError: state.attachError,
    analysisSnapshot: state.analysisSnapshot,
    loadingImages: state.loadingImages,
    workspaceLifecycle: state.workspaceLifecycle,
  };

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAnalysisSessionState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    processSelectedHandler = null;
    latestState = null;
    disposeAttachIntent.mockReset();
    vi.useRealTimers();
    resetDiagnosticsStateForTests();
    configureDiagnostics({
      clearBuffer: true,
      policy: {
        enabled: true,
        captureBuffer: true,
        consoleOutput: false,
        minimumLevel: 'debug',
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    resetDiagnosticsStateForTests();
    vi.useRealTimers();
  });

  it('attaches to a process, refreshes lifecycle, and stores the loaded snapshot against the active session', async () => {
    const session: ProcessSession = {
      pid: 1337,
      processName: 'Unity.exe',
      exePath: 'C:/Games/Unity.exe',
      dataDir: 'C:/Games/Game_Data',
      managedDir: 'C:/Games/Game_Data/Managed',
      runtime: 'mono',
    };
    const snapshot: AnalysisSnapshot = {
      schemaVersion: 1,
      generatedAt: '2026-03-22T12:00:00.000Z',
      process: null,
      images: [],
      classes: {},
      imageClassIndex: {},
    };
    const repository = createRepository({
      attachToProcess: vi.fn().mockResolvedValue(session),
      loadAllMetadata: vi.fn().mockResolvedValue(snapshot),
      getWorkspaceLifecycle: vi.fn().mockResolvedValue(createLifecycle({
        status: 'ready',
        processSession: session,
        runtime: 'mono',
        hasSnapshot: true,
        runtimeSession: {
          status: 'ready',
          runtime: 'mono',
          capabilities: ['metadata', 'execution', 'method-invoke'],
            connected: true,
          sessionKey: 'session-1',
          lastError: null,
          lastHeartbeatAt: '2026-03-22T12:00:01.000Z',
        },
      })),
    });
    const onResetWorkspace = vi.fn();
    const attachIntentChannel = createAttachIntentChannel();

    await act(async () => {
      root.render(createElement(HookHarness, { repository, onResetWorkspace, attachIntentChannel }));
    });
    await flushEffects();

    await act(async () => {
      await processSelectedHandler?.({ pid: 1337, name: 'Unity.exe' });
    });
    await flushEffects();

    expect(onResetWorkspace).toHaveBeenCalledTimes(1);
    expect(repository.attachToProcess).toHaveBeenCalledWith({ pid: 1337, name: 'Unity.exe' });
    expect(repository.loadAllMetadata).toHaveBeenCalledTimes(1);
    expect(latestState).toMatchObject({
      processSession: session,
      attachError: null,
      loadingImages: false,
      workspaceLifecycle: {
        status: 'ready',
        hasSnapshot: true,
        runtime: 'mono',
      },
    });
    expect(latestState?.analysisSnapshot).toEqual({
      ...snapshot,
      process: session,
    });
  });

  it('falls back to a runtime-error lifecycle when attach fails', async () => {
    const repository = createRepository({
      attachToProcess: vi.fn().mockRejectedValue(new Error('runtime session failed to attach')),
      getWorkspaceLifecycle: vi.fn().mockRejectedValue(new Error('workspace unavailable')),
    });
    const onResetWorkspace = vi.fn();
    const attachIntentChannel = createAttachIntentChannel();

    await act(async () => {
      root.render(createElement(HookHarness, { repository, onResetWorkspace, attachIntentChannel }));
    });
    await flushEffects();

    await act(async () => {
      await processSelectedHandler?.({ pid: 2001, name: 'BrokenUnity.exe' });
    });
    await flushEffects();

    expect(onResetWorkspace).toHaveBeenCalledTimes(1);
    expect(latestState).toMatchObject({
      processSession: null,
      analysisSnapshot: null,
      loadingImages: false,
      attachError: 'runtime session failed to attach',
      workspaceLifecycle: {
        status: 'runtime-error',
        runtime: 'unknown',
        hasSnapshot: false,
        errorMessage: 'runtime session failed to attach',
      },
    });
    expect(getDiagnosticsBuffer()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        channel: 'analysis',
        origin: 'useAnalysisSessionState',
        message: 'Process attach failed.',
        context: expect.objectContaining({
          pid: 2001,
          processName: 'BrokenUnity.exe',
        }),
        error: expect.objectContaining({
          message: 'runtime session failed to attach',
        }),
      }),
    ]));
  });

  it('keeps the session attached-without-snapshot when metadata loading fails after attach', async () => {
    const session: ProcessSession = {
      pid: 4004,
      processName: 'UnityFail.exe',
      exePath: 'C:/Games/UnityFail.exe',
      dataDir: 'C:/Games/UnityFail_Data',
      managedDir: 'C:/Games/UnityFail_Data/Managed',
      runtime: 'il2cpp',
    };
    const repository = createRepository({
      attachToProcess: vi.fn().mockResolvedValue(session),
      loadAllMetadata: vi.fn().mockRejectedValue(new Error('metadata reader crashed')),
      getWorkspaceLifecycle: vi.fn().mockRejectedValue(new Error('workspace unavailable')),
    });
    const attachIntentChannel = createAttachIntentChannel();

    await act(async () => {
      root.render(createElement(HookHarness, { repository, onResetWorkspace: vi.fn(), attachIntentChannel }));
    });
    await flushEffects();

    await act(async () => {
      await processSelectedHandler?.({ pid: 4004, name: 'UnityFail.exe' });
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      processSession: session,
      attachError: null,
      analysisSnapshot: null,
      loadingImages: false,
      workspaceLifecycle: {
        status: 'attached-without-snapshot',
        processSession: session,
        runtime: 'il2cpp',
        hasSnapshot: false,
      },
    });
    expect(getDiagnosticsBuffer()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        channel: 'analysis',
        origin: 'useAnalysisSessionState',
        message: 'Analysis metadata load failed.',
        context: expect.objectContaining({
          processName: 'UnityFail.exe',
          runtime: 'il2cpp',
        }),
        error: expect.objectContaining({
          message: 'metadata reader crashed',
        }),
      }),
    ]));
  });

  it('refreshes workspace lifecycle when the window regains focus', async () => {
    const session: ProcessSession = {
      pid: 9001,
      processName: 'FocusUnity.exe',
      exePath: 'C:/Games/FocusUnity.exe',
      dataDir: 'C:/Games/FocusUnity_Data',
      managedDir: 'C:/Games/FocusUnity_Data/Managed',
      runtime: 'mono',
    };
    const repository = createRepository({
      attachToProcess: vi.fn().mockResolvedValue(session),
      loadAllMetadata: vi.fn().mockResolvedValue({ process: null, generatedAt: '2026-03-22T12:00:00.000Z', images: [], classes: {} }),
      getWorkspaceLifecycle: vi.fn()
        .mockResolvedValueOnce(createLifecycle())
        .mockResolvedValueOnce(createLifecycle({
          status: 'ready',
          processSession: session,
          runtime: 'mono',
          hasSnapshot: true,
          runtimeSession: {
            status: 'ready',
            runtime: 'mono',
            capabilities: ['metadata', 'execution'],
            connected: true,
            sessionKey: 'session-focus',
            lastError: null,
            lastHeartbeatAt: '2026-03-22T12:04:00.000Z',
          },
        }))
        .mockResolvedValueOnce(createLifecycle({
          status: 'recovering',
          runtime: 'mono',
          errorMessage: 'runtime heartbeat missed',
          runtimeSession: {
            status: 'recovering',
            runtime: 'mono',
            capabilities: ['metadata', 'execution'],
            connected: false,
            sessionKey: 'session-2',
            lastError: 'runtime heartbeat missed',
            lastHeartbeatAt: '2026-03-22T12:05:00.000Z',
          },
        }))
        .mockResolvedValue(createLifecycle({
          status: 'recovering',
          runtime: 'mono',
          errorMessage: 'runtime heartbeat missed',
          runtimeSession: {
            status: 'recovering',
            runtime: 'mono',
            capabilities: ['metadata', 'execution'],
            connected: false,
            sessionKey: 'session-2',
            lastError: 'runtime heartbeat missed',
            lastHeartbeatAt: '2026-03-22T12:05:00.000Z',
          },
        })),
    });
    const attachIntentChannel = createAttachIntentChannel();

    await act(async () => {
      root.render(createElement(HookHarness, { repository, onResetWorkspace: vi.fn(), attachIntentChannel }));
    });
    await flushEffects();

    await act(async () => {
      await processSelectedHandler?.({ pid: 9001, name: 'FocusUnity.exe' });
    });
    await flushEffects();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    await flushEffects();

    expect(repository.getWorkspaceLifecycle).toHaveBeenCalledTimes(4);
    expect(latestState?.workspaceLifecycle).toMatchObject({
      status: 'recovering',
      errorMessage: 'runtime heartbeat missed',
      runtimeSession: {
        status: 'recovering',
        connected: false,
        lastError: 'runtime heartbeat missed',
      },
    });
  });
});