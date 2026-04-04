// @vitest-environment jsdom

import React, { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useAnalysisRuntimeState } from './useAnalysisRuntimeState';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import type { AnalysisSnapshot, ProcessSession, SceneWorkspaceState } from '../contracts';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import { createClassStableId, createImageStableId, createFieldStableId } from '../../contracts/shared-identity';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMAGE_ID = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_ID = createClassStableId({ imageStableId: IMAGE_ID, namespace: 'Gameplay', className: 'PlayerController' });
const STATIC_FIELD_ID = createFieldStableId({ classStableId: CLASS_ID, fieldName: 'speed', fieldType: 'System.Single', fieldKind: 'static' });
const INSTANCE_FIELD_ID = createFieldStableId({ classStableId: CLASS_ID, fieldName: 'speed', fieldType: 'System.Single', fieldKind: 'instance' });

interface HookSnapshot {
  runtimeOverlays: ReturnType<typeof useAnalysisRuntimeState>['runtimeOverlays'];
  runtimeMemberValuesByClassAndAddress: ReturnType<typeof useAnalysisRuntimeState>['runtimeMemberValuesByClassAndAddress'];
  ensureRuntimeOverlayLoaded: ReturnType<typeof useAnalysisRuntimeState>['ensureRuntimeOverlayLoaded'];
  ensureRuntimeInstanceFieldsLoaded: ReturnType<typeof useAnalysisRuntimeState>['ensureRuntimeInstanceFieldsLoaded'];
}

let latestState: HookSnapshot | null = null;

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
  preferredSelectionHint: null,
  activeSelf: null,
  tag: null,
  layer: null,
  hideFlags: null,
  behaviourEnabled: null,
  hierarchyPath: [],
  transform: null,
};

function createLifecycle(overrides: Partial<WorkspaceLifecycleState> = {}): WorkspaceLifecycleState {
  return {
    ...EMPTY_WORKSPACE_LIFECYCLE,
    status: 'ready',
    hasSnapshot: true,
    runtime: 'mono',
    ...overrides,
    runtimeSession: {
      ...EMPTY_WORKSPACE_LIFECYCLE.runtimeSession,
      status: 'ready',
      runtime: 'mono',
      connected: true,
      ...overrides.runtimeSession,
    },
  };
}

function createRepository(): AnalysisRepository {
  return {
    attachToProcess: vi.fn(),
    getContractVersions: vi.fn(),
    getWorkspaceLifecycle: vi.fn(),
    loadAllMetadata: vi.fn(),
    getRuntimeStaticFields: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-03-22T12:00:00.000Z',
      classes: {
        [CLASS_ID]: {
          classStableId: CLASS_ID,
          fields: [],
          staticFields: [{
            stableId: STATIC_FIELD_ID,
            name: 'speed',
            fieldType: 'System.Single',
            address: '0x1000',
            value: '1.5',
          }],
        },
      },
    }),
    getRuntimeInstanceFields: vi.fn().mockResolvedValue({
      classStableId: CLASS_ID,
      instanceAddress: '0x1234',
      fields: [{
        stableId: INSTANCE_FIELD_ID,
        name: 'speed',
        fieldType: 'System.Single',
        offset: null,
        address: '0x2000',
        value: '2.5',
      }],
    }),
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
    createSceneRoot: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    createSceneChild: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    duplicateSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    deleteSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    renameSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectTag: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectLayer: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectHideFlags: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    reparentSceneObject: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectActive: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneObjectTransform: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    setSceneBehaviourEnabled: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    createSceneComponent: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    deleteSceneComponent: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
    loadSceneByBuildIndex: vi.fn().mockResolvedValue(EMPTY_SCENE_MUTATION_RESULT),
  } as AnalysisRepository;
}

const SESSION: ProcessSession = {
  pid: 1337,
  processName: 'Unity.exe',
  exePath: 'C:/Unity.exe',
  dataDir: 'C:/Game_Data',
  managedDir: 'C:/Game_Data/Managed',
  runtime: 'mono',
};

const SNAPSHOT: AnalysisSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-03-22T12:00:00.000Z',
  process: SESSION,
  images: [{ stableId: IMAGE_ID, name: 'Assembly-CSharp.dll', path: 'Assembly-CSharp.dll' }],
  classes: {
    [CLASS_ID]: {
      stableId: CLASS_ID,
      imageStableId: IMAGE_ID,
      name: 'PlayerController',
      namespace: 'Gameplay',
      fullName: 'Gameplay.PlayerController',
      inheritance: [{ name: 'System.Object' }],
      fields: [{ stableId: INSTANCE_FIELD_ID, name: 'speed', fieldType: 'System.Single', offset: null }],
      staticFields: [],
      methods: [],
    },
  },
  imageClassIndex: {
    [IMAGE_ID]: [CLASS_ID],
  },
};

function HookHarness({ repository, lifecycle }: { repository: AnalysisRepository; lifecycle: WorkspaceLifecycleState }) {
  const state = useAnalysisRuntimeState({
    repository,
    processSession: SESSION,
    analysisSnapshot: SNAPSHOT,
    workspaceLifecycle: lifecycle,
  });

  latestState = {
    runtimeOverlays: state.runtimeOverlays,
    runtimeMemberValuesByClassAndAddress: state.runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded: state.ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded: state.ensureRuntimeInstanceFieldsLoaded,
  };

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAnalysisRuntimeState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestState = null;
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

  it('clears cached runtime overlays and instance values when the workspace enters recovery', async () => {
    const repository = createRepository();

    await act(async () => {
      root.render(createElement(HookHarness, { repository, lifecycle: createLifecycle() }));
    });
    await flushEffects();

    await act(async () => {
      latestState?.ensureRuntimeOverlayLoaded(CLASS_ID);
      latestState?.ensureRuntimeInstanceFieldsLoaded(CLASS_ID, '0x1234');
      await Promise.resolve();
    });
    await flushEffects();

    expect(Object.keys(latestState?.runtimeOverlays ?? {})).toContain(CLASS_ID);
    expect(latestState?.runtimeMemberValuesByClassAndAddress[CLASS_ID]?.['0x1234']?.[INSTANCE_FIELD_ID]?.value).toBe('2.5');

    await act(async () => {
      root.render(createElement(HookHarness, {
        repository,
        lifecycle: createLifecycle({
          status: 'recovering',
          runtimeSession: {
            status: 'recovering',
            runtime: 'mono',
            capabilities: ['metadata', 'execution'],
            connected: false,
            sessionKey: 'session-1',
            lastError: 'runtime session disconnected',
            lastHeartbeatAt: '2026-03-22T12:01:00.000Z',
          },
        }),
      }));
    });
    await flushEffects();

    expect(latestState?.runtimeOverlays).toEqual({});
    expect(latestState?.runtimeMemberValuesByClassAndAddress).toEqual({});
  });
});