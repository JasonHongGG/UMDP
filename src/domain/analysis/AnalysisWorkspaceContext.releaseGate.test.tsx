// @vitest-environment jsdom

import React, { act, createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { AppInfrastructureProvider } from '@/app/AppInfrastructureContext';
import { useWorkspaceShellState } from '@/domain/workspace/WorkspaceShellContext';
import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession } from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { AnalysisWorkspaceProvider, useAnalysisWorkspace } from './AnalysisWorkspaceContext';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createTauriAnalysisRepository: vi.fn(),
  createTauriSceneGateway: vi.fn(),
  createTauriWorkspaceAttachIntentChannel: vi.fn(),
  disposeAttachIntent: vi.fn(),
}));

let processSelectedHandler: ((process: ProcessInfo) => void | Promise<void>) | null = null;

vi.mock('@/infrastructure/tauri/TauriAnalysisRepository', () => ({
  createTauriAnalysisRepository: mocks.createTauriAnalysisRepository,
}));

vi.mock('@/infrastructure/tauri/TauriSceneGateway', () => ({
  createTauriSceneGateway: mocks.createTauriSceneGateway,
}));

vi.mock('@/infrastructure/tauri/TauriWorkspaceAttachIntentChannel', () => ({
  createTauriWorkspaceAttachIntentChannel: mocks.createTauriWorkspaceAttachIntentChannel,
}));

interface WorkflowSnapshot {
  status: WorkspaceLifecycleState['status'];
  processPid: number | null;
  sessionKey: string | null;
  hasSnapshot: boolean;
  runtimeLabel: string;
  sceneSelectionReady: boolean;
  studioSelectionReady: boolean;
  resetNoticeKind: string | null;
  taskCount: number;
  analysisProcessPid: number | null;
  analysisSchemaVersion: number | null;
}

let latestState: WorkflowSnapshot | null = null;
let history: WorkflowSnapshot[] = [];
let setWorkspaceTasks: ((sourceKey: string, tasks: WorkspaceTaskSnapshot[]) => void) | null = null;

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

function createAttachedLifecycle(
  session: ProcessSession,
  sessionKey: string,
  resourceRevision: number,
): WorkspaceLifecycleState {
  return createLifecycle({
    resourceRevision,
    status: 'attached-without-snapshot',
    processSession: session,
    runtime: session.runtime,
    hasSnapshot: false,
    runtimeSession: {
      status: 'starting',
      runtime: session.runtime,
      capabilities: ['metadata', 'execution', 'scene-read'],
        connected: false,
      sessionKey,
      lastError: null,
      lastHeartbeatAt: null,
    },
  });
}

function createReadyLifecycle(
  session: ProcessSession,
  sessionKey: string,
  resourceRevision: number,
  runtimeSessionOverrides: Partial<WorkspaceLifecycleState['runtimeSession']> = {},
): WorkspaceLifecycleState {
  return createLifecycle({
    resourceRevision,
    status: 'ready',
    processSession: session,
    runtime: session.runtime,
    hasSnapshot: true,
    runtimeSession: {
      status: 'ready',
      runtime: session.runtime,
      capabilities: ['metadata', 'execution', 'scene-read'],
      connected: true,
      sessionKey,
      lastError: null,
      lastHeartbeatAt: '2026-03-31T10:00:00.000Z',
      ...runtimeSessionOverrides,
    },
  });
}

function createSnapshot(session: ProcessSession, generatedAt: string): AnalysisSnapshot {
  return {
    schemaVersion: 1,
    generatedAt,
    process: null,
    images: [],
    classes: {},
    imageClassIndex: {},
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;

  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function createRepository(overrides: Partial<AnalysisRepository> = {}): AnalysisRepository {
  return {
    attachToProcess: vi.fn(),
    getContractVersions: vi.fn(),
    getWorkspaceLifecycle: vi.fn(),
    loadAllMetadata: vi.fn(),
    getRuntimeStaticFields: vi.fn(),
    getRuntimeInstanceFields: vi.fn(),
    ...overrides,
  } as AnalysisRepository;
}

function TestConsumer() {
  const shell = useWorkspaceShellState();
  const analysis = useAnalysisWorkspace();

  setWorkspaceTasks = shell.setWorkspaceTasks;
  latestState = {
    status: shell.workspaceLifecycle.status,
    processPid: shell.processSession?.pid ?? null,
    sessionKey: shell.workspaceLifecycle.runtimeSession.sessionKey,
    hasSnapshot: shell.workspaceLifecycle.hasSnapshot,
    runtimeLabel: shell.workspacePresentation.runtimeLabel,
    sceneSelectionReady: shell.workspacePresentation.pages.scene.selectionReady,
    studioSelectionReady: shell.workspacePresentation.pages.studio.selectionReady,
    resetNoticeKind: shell.workspacePresentation.notice?.kind ?? null,
    taskCount: shell.workspaceTasks.length,
    analysisProcessPid: analysis.analysisSnapshot?.process?.pid ?? null,
    analysisSchemaVersion: shell.contractVersions?.analysisSchemaVersion ?? null,
  };

  useEffect(() => {
    history.push({
      status: shell.workspaceLifecycle.status,
      processPid: shell.processSession?.pid ?? null,
      sessionKey: shell.workspaceLifecycle.runtimeSession.sessionKey,
      hasSnapshot: shell.workspaceLifecycle.hasSnapshot,
      runtimeLabel: shell.workspacePresentation.runtimeLabel,
      sceneSelectionReady: shell.workspacePresentation.pages.scene.selectionReady,
      studioSelectionReady: shell.workspacePresentation.pages.studio.selectionReady,
      resetNoticeKind: shell.workspacePresentation.notice?.kind ?? null,
      taskCount: shell.workspaceTasks.length,
      analysisProcessPid: analysis.analysisSnapshot?.process?.pid ?? null,
      analysisSchemaVersion: shell.contractVersions?.analysisSchemaVersion ?? null,
    });
  }, [analysis.analysisSnapshot?.process?.pid, shell.contractVersions?.analysisSchemaVersion, shell.processSession?.pid, shell.workspaceLifecycle.hasSnapshot, shell.workspaceLifecycle.runtimeSession.sessionKey, shell.workspaceLifecycle.status, shell.workspacePresentation.notice?.kind, shell.workspacePresentation.pages.scene.selectionReady, shell.workspacePresentation.pages.studio.selectionReady, shell.workspaceTasks.length]);

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AnalysisWorkspaceProvider release gates', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    processSelectedHandler = null;
    latestState = null;
    history = [];
    setWorkspaceTasks = null;
    mocks.createTauriAnalysisRepository.mockReset();
    mocks.createTauriSceneGateway.mockReset();
    mocks.createTauriWorkspaceAttachIntentChannel.mockReset();
    mocks.disposeAttachIntent.mockReset();
    mocks.createTauriWorkspaceAttachIntentChannel.mockReturnValue({
      openProcessSelector: vi.fn().mockResolvedValue(undefined),
      onAttachIntent: vi.fn(async (handler: (process: ProcessInfo) => void | Promise<void>) => {
        processSelectedHandler = handler;
        return mocks.disposeAttachIntent;
      }),
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
  });

  it('gates scene and studio until metadata is ready, then resets tasks on reattach', async () => {
    const sessionOne: ProcessSession = {
      pid: 1001,
      processName: 'UnityAlpha.exe',
      exePath: 'C:/Games/UnityAlpha.exe',
      dataDir: 'C:/Games/UnityAlpha_Data',
      managedDir: 'C:/Games/UnityAlpha_Data/Managed',
      runtime: 'mono',
    };
    const sessionTwo: ProcessSession = {
      pid: 2002,
      processName: 'UnityBeta.exe',
      exePath: 'C:/Games/UnityBeta.exe',
      dataDir: 'C:/Games/UnityBeta_Data',
      managedDir: 'C:/Games/UnityBeta_Data/Managed',
      runtime: 'mono',
    };
    const contractVersions: SystemContractVersions = {
      tauriCommandVersion: 1,
      analysisSchemaVersion: 2,
      workflowSchemaVersion: 1,
    };
    const firstMetadataLoad = createDeferred<AnalysisSnapshot>();
    const secondMetadataLoad = createDeferred<AnalysisSnapshot>();
    const repository = createRepository({
      attachToProcess: vi.fn()
        .mockResolvedValueOnce(sessionOne)
        .mockResolvedValueOnce(sessionTwo),
      getContractVersions: vi.fn().mockResolvedValue(contractVersions),
      getWorkspaceLifecycle: vi.fn()
        .mockResolvedValueOnce(createLifecycle())
        .mockResolvedValueOnce(createAttachedLifecycle(sessionOne, 'session-1', 1))
        .mockResolvedValueOnce(createReadyLifecycle(sessionOne, 'session-1', 2))
        .mockResolvedValueOnce(createAttachedLifecycle(sessionTwo, 'session-2', 3))
        .mockResolvedValueOnce(createReadyLifecycle(sessionTwo, 'session-2', 4)),
      loadAllMetadata: vi.fn()
        .mockImplementationOnce(() => firstMetadataLoad.promise)
        .mockImplementationOnce(() => secondMetadataLoad.promise),
      getRuntimeStaticFields: vi.fn(),
      getRuntimeInstanceFields: vi.fn(),
    });

    mocks.createTauriAnalysisRepository.mockReturnValue(repository);
    mocks.createTauriSceneGateway.mockReturnValue({});

    await act(async () => {
      root.render(
        createElement(AppInfrastructureProvider, null,
          createElement(AnalysisWorkspaceProvider, null,
            createElement(TestConsumer),
          ),
        ),
      );
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      status: 'detached',
      sceneSelectionReady: false,
      studioSelectionReady: false,
      taskCount: 0,
      analysisSchemaVersion: 2,
    });

    let firstAttach: Promise<void> | void;
    await act(async () => {
      firstAttach = processSelectedHandler?.({ pid: 1001, name: 'UnityAlpha.exe' });
      await Promise.resolve();
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      processPid: 1001,
      sessionKey: 'session-1',
      hasSnapshot: false,
      sceneSelectionReady: false,
      studioSelectionReady: false,
      taskCount: 0,
    });
    expect(latestState?.status).not.toBe('ready');
    expect(history.some((entry) => entry.processPid === 1001 && !entry.sceneSelectionReady && !entry.hasSnapshot)).toBe(true);

    await act(async () => {
      firstMetadataLoad.resolve(createSnapshot(sessionOne, '2026-03-31T10:00:00.000Z'));
      await firstAttach;
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      status: 'ready',
      processPid: 1001,
      analysisProcessPid: 1001,
      sessionKey: 'session-1',
      hasSnapshot: true,
      sceneSelectionReady: true,
      studioSelectionReady: true,
      taskCount: 0,
    });

    await act(async () => {
      setWorkspaceTasks?.('scene', [{
        taskId: 'scene-refresh',
        resourceKind: 'scene',
        operationKey: 'scene.refresh',
        scope: 'resource',
        status: 'running',
        progress: {
          completed: 0,
          total: 1,
          message: 'Refreshing scene workspace',
        },
        targetId: null,
        startedAt: '2026-03-31T10:01:00.000Z',
        updatedAt: '2026-03-31T10:01:00.000Z',
        errorMessage: null,
      }]);
    });
    await flushEffects();

    expect(latestState?.taskCount).toBe(1);

    let secondAttach: Promise<void> | void;
    await act(async () => {
      secondAttach = processSelectedHandler?.({ pid: 2002, name: 'UnityBeta.exe' });
      await Promise.resolve();
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      processPid: 2002,
      sessionKey: 'session-2',
      hasSnapshot: false,
      sceneSelectionReady: false,
      studioSelectionReady: false,
      taskCount: 0,
    });
    expect(latestState?.status).not.toBe('ready');
    await flushEffects();
    expect(history.some((entry) => entry.processPid === 2002 && entry.taskCount === 0 && entry.resetNoticeKind === 'session-changed' && !entry.hasSnapshot)).toBe(true);

    await act(async () => {
      secondMetadataLoad.resolve(createSnapshot(sessionTwo, '2026-03-31T10:05:00.000Z'));
      await secondAttach;
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      status: 'ready',
      processPid: 2002,
      analysisProcessPid: 2002,
      sessionKey: 'session-2',
      hasSnapshot: true,
      sceneSelectionReady: true,
      studioSelectionReady: true,
      taskCount: 0,
    });
    expect(history.some((entry) => entry.resetNoticeKind === 'session-changed')).toBe(true);
  });

  it('keeps scene and studio gated until runtime becomes interactive after metadata is loaded', async () => {
    const session: ProcessSession = {
      pid: 3003,
      processName: 'UnityGamma.exe',
      exePath: 'C:/Games/UnityGamma.exe',
      dataDir: 'C:/Games/UnityGamma_Data',
      managedDir: 'C:/Games/UnityGamma_Data/Managed',
      runtime: 'mono',
    };
    const contractVersions: SystemContractVersions = {
      tauriCommandVersion: 1,
      analysisSchemaVersion: 2,
      workflowSchemaVersion: 1,
    };
    const metadataLoad = createDeferred<AnalysisSnapshot>();
    const repository = createRepository({
      attachToProcess: vi.fn().mockResolvedValue(session),
      getContractVersions: vi.fn().mockResolvedValue(contractVersions),
      getWorkspaceLifecycle: vi.fn()
        .mockResolvedValueOnce(createLifecycle())
        .mockResolvedValueOnce(createAttachedLifecycle(session, 'session-3', 1))
        .mockResolvedValueOnce(createReadyLifecycle(session, 'session-3', 2, {
          status: 'starting',
          connected: false,
          lastHeartbeatAt: null,
        }))
        .mockResolvedValueOnce(createReadyLifecycle(session, 'session-3', 3)),
      loadAllMetadata: vi.fn().mockImplementationOnce(() => metadataLoad.promise),
      getRuntimeStaticFields: vi.fn(),
      getRuntimeInstanceFields: vi.fn(),
    });

    mocks.createTauriAnalysisRepository.mockReturnValue(repository);
    mocks.createTauriSceneGateway.mockReturnValue({});

    await act(async () => {
      root.render(
        createElement(AppInfrastructureProvider, null,
          createElement(AnalysisWorkspaceProvider, null,
            createElement(TestConsumer),
          ),
        ),
      );
    });
    await flushEffects();

    let attach: Promise<void> | void;
    await act(async () => {
      attach = processSelectedHandler?.({ pid: session.pid, name: session.processName });
      await Promise.resolve();
    });
    await flushEffects();

    await act(async () => {
      metadataLoad.resolve(createSnapshot(session, '2026-03-31T10:10:00.000Z'));
      await attach;
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      status: 'ready',
      processPid: 3003,
      sessionKey: 'session-3',
      hasSnapshot: true,
      runtimeLabel: 'Runtime Starting',
      sceneSelectionReady: false,
      studioSelectionReady: false,
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    await flushEffects();

    expect(latestState).toMatchObject({
      status: 'ready',
      processPid: 3003,
      sessionKey: 'session-3',
      hasSnapshot: true,
      runtimeLabel: 'Runtime Ready',
      sceneSelectionReady: true,
      studioSelectionReady: true,
    });
  });
});