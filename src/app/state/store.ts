import {
  configureStore,
  createAsyncThunk,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { StableId } from '@/domain/contracts/shared-identity';
import type {
  AnalysisSnapshot,
  ProcessInfo,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeInstanceFieldSnapshot,
} from '@/domain/analysis/contracts';
import type { ActivePage } from '@/domain/analysis/workspace-types';
import { createAnalysisClassInfo, createAnalysisClassSummary } from '@/domain/analysis/view-models';
import { buildStudioClassCatalog, createClassInfoCatalogFromClassDescriptor, type PendingClassNodeRequest } from '@/domain/studio/editor';
import type { ResolvedMemberRuntimeValue } from '@/domain/studio/runtime';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import {
  createWorkspacePresentation,
  createWorkspaceViewState,
  type WorkspacePresentation,
  type WorkspaceViewState,
} from '@/domain/workspace/presentation';
import type {
  OperationErrorEnvelope,
  OperationFeedbackEnvelope,
  SystemContractVersions,
  WorkspaceLifecycleState,
  WorkspaceTaskSnapshot,
} from '@/shared/contracts';
import { coerceOperationErrorEnvelope } from '@/shared/contracts';
import { formatHexAddress } from '@/core/addressFormat';

const ATTACHED_SCENE_RUNTIME_CAPABILITIES: WorkspaceLifecycleState['runtimeSession']['capabilities'] = [
  'metadata',
  'execution',
  'scene-catalog-read',
  'scene-object-header-read',
  'scene-object-children-read',
];

export interface AppServices {
  analysisRepository: AnalysisRepository;
}

export interface WorkspaceSliceState {
  activePage: ActivePage;
  contractVersions: SystemContractVersions | null;
  lifecycle: WorkspaceLifecycleState;
  previousLifecycle: WorkspaceLifecycleState | null;
  tasksBySource: Record<string, WorkspaceTaskSnapshot[]>;
  feedback: OperationFeedbackEnvelope | null;
}

export interface AnalysisSliceState {
  attachError: OperationErrorEnvelope | null;
  analysisSnapshot: AnalysisSnapshot | null;
  loadingSnapshot: boolean;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  runtimeInstanceFieldSnapshots: Record<string, RuntimeInstanceFieldSnapshot>;
  runtimeFieldErrorByKey: Record<string, OperationErrorEnvelope | null>;
  loadingRuntimeByKey: Record<string, boolean>;
  runtimeInstanceFieldErrorByKey: Record<string, OperationErrorEnvelope | null>;
  loadingRuntimeInstanceByKey: Record<string, boolean>;
  pendingClassNode: PendingClassNodeRequest | null;
}

export interface AppStateShape {
  workspace: WorkspaceSliceState;
  analysis: AnalysisSliceState;
}

interface ThunkConfig {
  state: AppStateShape;
  extra: AppServices;
  rejectValue: OperationErrorEnvelope;
}

const SERIALIZABLE_CHECK_IGNORED_PATHS = [
  'analysis.analysisSnapshot',
  'analysis.runtimeOverlays',
  'analysis.runtimeInstanceFieldSnapshots',
] as const;

const SERIALIZABLE_CHECK_WARN_AFTER_MS = 1000;

function makeRuntimeSessionKey(processSession: ProcessSession) {
  const runtime = processSession.runtime === 'unknown'
    ? 'Unknown'
    : processSession.runtime === 'il2cpp'
      ? 'Il2cpp'
      : 'Mono';
  return `${processSession.pid}:${processSession.processName}:${runtime}`;
}

function makeFallbackLifecycle(
  fallback: Partial<WorkspaceLifecycleState>,
  previous: WorkspaceLifecycleState,
): WorkspaceLifecycleState {
  return {
    ...previous,
    ...fallback,
    runtimeSession: fallback.runtimeSession
      ? {
          ...previous.runtimeSession,
          ...fallback.runtimeSession,
        }
      : previous.runtimeSession,
  };
}

function shouldClearRuntimeState(lifecycle: WorkspaceLifecycleState) {
  return !lifecycle.processSession
    || !lifecycle.hasSnapshot
    || lifecycle.status === 'runtime-error'
    || !lifecycle.runtimeSession.connected
    || lifecycle.runtimeSession.status === 'error';
}

function clearRuntimeCaches(state: AnalysisSliceState) {
  state.runtimeOverlays = {};
  state.runtimeInstanceFieldSnapshots = {};
  state.runtimeFieldErrorByKey = {};
  state.loadingRuntimeByKey = {};
  state.runtimeInstanceFieldErrorByKey = {};
  state.loadingRuntimeInstanceByKey = {};
}

function areTaskProgressEqual(left: WorkspaceTaskSnapshot['progress'], right: WorkspaceTaskSnapshot['progress']) {
  if (left === right) {
    return true;
  }

  if (left == null || right == null) {
    return left == null && right == null;
  }

  return left.completed === right.completed
    && left.total === right.total
    && left.message === right.message;
}

function areWorkspaceTasksEqual(left: WorkspaceTaskSnapshot[] | undefined, right: WorkspaceTaskSnapshot[]) {
  if (!left) {
    return right.length === 0;
  }

  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const current = left[index];
    const next = right[index];
    if (current.taskId !== next.taskId
      || current.resourceKind !== next.resourceKind
      || current.operationKey !== next.operationKey
      || current.scope !== next.scope
      || current.status !== next.status
      || current.targetId !== next.targetId
      || current.startedAt !== next.startedAt
      || current.updatedAt !== next.updatedAt
      || current.errorMessage !== next.errorMessage
      || !areTaskProgressEqual(current.progress, next.progress)) {
      return false;
    }
  }

  return true;
}

const initialWorkspaceState: WorkspaceSliceState = {
  activePage: 'inspector',
  contractVersions: null,
  lifecycle: EMPTY_WORKSPACE_LIFECYCLE,
  previousLifecycle: null,
  tasksBySource: {},
  feedback: null,
};

const initialAnalysisState: AnalysisSliceState = {
  attachError: null,
  analysisSnapshot: null,
  loadingSnapshot: false,
  runtimeOverlays: {},
  runtimeInstanceFieldSnapshots: {},
  runtimeFieldErrorByKey: {},
  loadingRuntimeByKey: {},
  runtimeInstanceFieldErrorByKey: {},
  loadingRuntimeInstanceByKey: {},
  pendingClassNode: null,
};

export const refreshWorkspaceLifecycle = createAsyncThunk<WorkspaceLifecycleState, string | undefined, ThunkConfig>(
  'workspace/refreshLifecycle',
  async (reason, { extra, rejectWithValue }) => {
    try {
      return await extra.analysisRepository.getWorkspaceLifecycle();
    } catch (error) {
      return rejectWithValue(coerceOperationErrorEnvelope(error, reason ?? 'workspace.refresh-lifecycle'));
    }
  },
);

export const loadContractVersions = createAsyncThunk<SystemContractVersions, void, ThunkConfig>(
  'workspace/loadContractVersions',
  async (_arg, { extra, rejectWithValue }) => {
    try {
      return await extra.analysisRepository.getContractVersions();
    } catch (error) {
      return rejectWithValue(coerceOperationErrorEnvelope(error, 'workspace.get-contract-versions'));
    }
  },
);

export const loadAnalysisSnapshot = createAsyncThunk<AnalysisSnapshot, ProcessSession | null, ThunkConfig>(
  'analysis/loadSnapshot',
  async (processSession, { dispatch, extra, rejectWithValue }) => {
    try {
      const snapshot = await extra.analysisRepository.loadAllMetadata();
      return {
        ...snapshot,
        process: processSession,
      };
    } catch (error) {
      return rejectWithValue(coerceOperationErrorEnvelope(error, 'metadata.load-all'));
    } finally {
      await dispatch(refreshWorkspaceLifecycle('workspace.after-metadata-load'));
    }
  },
);

export const attachToProcess = createAsyncThunk<ProcessSession, ProcessInfo, ThunkConfig>(
  'workspace/attachToProcess',
  async (process, { dispatch, extra, rejectWithValue }) => {
    dispatch(workspaceActions.applyLifecycleFallback({
      status: 'attaching',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: false,
      errorMessage: null,
      runtimeSession: {
        status: 'starting',
        runtime: 'unknown',
        capabilities: EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.capabilities,
        sceneObjectComponents: EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.sceneObjectComponents,
        connected: false,
        sessionKey: null,
        lastError: null,
        lastHeartbeatAt: null,
      },
    }));
    dispatch(workspaceActions.clearWorkspaceTasks());
    dispatch(analysisActions.resetForSession());

    try {
      const session = await extra.analysisRepository.attachToProcess({
        pid: process.pid,
        name: process.name,
      });

      dispatch(workspaceActions.applyLifecycleFallback({
        status: 'attached-without-snapshot',
        processSession: session,
        runtime: session.runtime,
        hasSnapshot: false,
        errorMessage: null,
        runtimeSession: {
          status: 'starting',
          runtime: session.runtime,
          capabilities: ATTACHED_SCENE_RUNTIME_CAPABILITIES,
          sceneObjectComponents: EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.sceneObjectComponents,
          connected: false,
          sessionKey: makeRuntimeSessionKey(session),
          lastError: null,
          lastHeartbeatAt: null,
        },
      }));

      await dispatch(refreshWorkspaceLifecycle('workspace.after-attach')).unwrap();
      await dispatch(loadAnalysisSnapshot(session)).unwrap();
      return session;
    } catch (error) {
      const envelope = coerceOperationErrorEnvelope(error, 'workspace.attach-to-process');
      dispatch(workspaceActions.applyLifecycleFallback({
        status: 'runtime-error',
        processSession: null,
        runtime: 'unknown',
        hasSnapshot: false,
        errorMessage: envelope.message,
        runtimeSession: {
          status: 'error',
          runtime: 'unknown',
          capabilities: [],
          sceneObjectComponents: EMPTY_WORKSPACE_LIFECYCLE.runtimeSession.sceneObjectComponents,
          connected: false,
          sessionKey: null,
          lastError: envelope.message,
          lastHeartbeatAt: null,
        },
      }));
      return rejectWithValue(envelope);
    }
  },
);

export const ensureRuntimeOverlayLoaded = createAsyncThunk<RuntimeClassOverlayDescriptor, string, ThunkConfig>(
  'analysis/ensureRuntimeOverlayLoaded',
  async (classStableId, { extra, rejectWithValue }) => {
    try {
      const snapshot = await extra.analysisRepository.getRuntimeStaticFields(classStableId);
      const overlay = snapshot.classes[classStableId as StableId];
      if (!overlay) {
        throw new Error(`Runtime overlay not found for ${classStableId}`);
      }
      return overlay;
    } catch (error) {
      return rejectWithValue(coerceOperationErrorEnvelope(error, 'runtime.get-static-fields'));
    }
  },
  {
    condition: (classStableId, { getState }) => {
      const state = getState();
      return !state.analysis.runtimeOverlays[classStableId]
        && !state.analysis.loadingRuntimeByKey[classStableId];
    },
  },
);

export const ensureRuntimeInstanceFieldsLoaded = createAsyncThunk<RuntimeInstanceFieldSnapshot, { classStableId: string; instanceAddress: string }, ThunkConfig>(
  'analysis/ensureRuntimeInstanceFieldsLoaded',
  async ({ classStableId, instanceAddress }, { extra, rejectWithValue }) => {
    try {
      return await extra.analysisRepository.getRuntimeInstanceFields({
        classStableId,
        instanceAddress,
      });
    } catch (error) {
      return rejectWithValue(coerceOperationErrorEnvelope(error, 'runtime.get-instance-fields'));
    }
  },
  {
    condition: ({ classStableId, instanceAddress }, { getState }) => {
      const normalizedAddress = formatHexAddress(instanceAddress);
      if (!normalizedAddress) {
        return false;
      }

      const requestKey = `${classStableId}::${normalizedAddress}`;
      const state = getState();
      return !state.analysis.runtimeInstanceFieldSnapshots[requestKey]
        && !state.analysis.loadingRuntimeInstanceByKey[requestKey];
    },
  },
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: initialWorkspaceState,
  reducers: {
    setActivePage(state, action: PayloadAction<ActivePage>) {
      state.activePage = action.payload;
    },
    setWorkspaceTasks(state, action: PayloadAction<{ sourceKey: string; tasks: WorkspaceTaskSnapshot[] }>) {
      const { sourceKey, tasks } = action.payload;
      if (tasks.length === 0) {
        if (!(sourceKey in state.tasksBySource)) {
          return;
        }
        delete state.tasksBySource[sourceKey];
        return;
      }

      if (areWorkspaceTasksEqual(state.tasksBySource[sourceKey], tasks)) {
        return;
      }

      state.tasksBySource[sourceKey] = tasks;
    },
    clearWorkspaceTasks(state) {
      state.tasksBySource = {};
    },
    applyLifecycleFallback(state, action: PayloadAction<Partial<WorkspaceLifecycleState>>) {
      state.previousLifecycle = state.lifecycle;
      state.lifecycle = makeFallbackLifecycle(action.payload, state.lifecycle);
    },
    setFeedback(state, action: PayloadAction<OperationFeedbackEnvelope | null>) {
      state.feedback = action.payload;
    },
    clearFeedback(state) {
      state.feedback = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadContractVersions.fulfilled, (state, action) => {
        state.contractVersions = action.payload;
      })
      .addCase(refreshWorkspaceLifecycle.fulfilled, (state, action) => {
        state.previousLifecycle = state.lifecycle;
        state.lifecycle = action.payload;
      })
      .addCase(attachToProcess.rejected, (state, action) => {
        if (action.payload) {
          state.feedback = {
            operationKey: 'workspace.attach-to-process',
            tone: 'error',
            title: 'Attach Failed',
            description: action.payload.message,
            targetId: null,
            timestamp: new Date().toISOString(),
          };
        }
      });
  },
});

const analysisSlice = createSlice({
  name: 'analysis',
  initialState: initialAnalysisState,
  reducers: {
    queuePendingClassNode(state, action: PayloadAction<PendingClassNodeRequest>) {
      state.pendingClassNode = action.payload;
    },
    clearPendingClassNode(state) {
      state.pendingClassNode = null;
    },
    resetForSession(state) {
      state.attachError = null;
      state.analysisSnapshot = null;
      state.loadingSnapshot = false;
      state.pendingClassNode = null;
      clearRuntimeCaches(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAnalysisSnapshot.pending, (state) => {
        state.loadingSnapshot = true;
        state.attachError = null;
        state.analysisSnapshot = null;
      })
      .addCase(loadAnalysisSnapshot.fulfilled, (state, action) => {
        state.loadingSnapshot = false;
        state.analysisSnapshot = action.payload;
      })
      .addCase(loadAnalysisSnapshot.rejected, (state, action) => {
        state.loadingSnapshot = false;
        state.attachError = action.payload ?? null;
      })
      .addCase(attachToProcess.rejected, (state, action) => {
        state.attachError = action.payload ?? null;
        state.analysisSnapshot = null;
        state.pendingClassNode = null;
        clearRuntimeCaches(state);
      })
      .addCase(refreshWorkspaceLifecycle.fulfilled, (state, action) => {
        if (!action.payload.processSession) {
          state.analysisSnapshot = null;
          state.pendingClassNode = null;
        }

        if (shouldClearRuntimeState(action.payload)) {
          clearRuntimeCaches(state);
        }
      })
      .addCase(ensureRuntimeOverlayLoaded.pending, (state, action) => {
        state.loadingRuntimeByKey[action.meta.arg] = true;
        state.runtimeFieldErrorByKey[action.meta.arg] = null;
      })
      .addCase(ensureRuntimeOverlayLoaded.fulfilled, (state, action) => {
        state.runtimeOverlays[action.payload.classStableId] = action.payload;
        state.loadingRuntimeByKey[action.payload.classStableId] = false;
        state.runtimeFieldErrorByKey[action.payload.classStableId] = null;
      })
      .addCase(ensureRuntimeOverlayLoaded.rejected, (state, action) => {
        state.loadingRuntimeByKey[action.meta.arg] = false;
        if (action.payload) {
          state.runtimeFieldErrorByKey[action.meta.arg] = action.payload;
        }
      })
      .addCase(ensureRuntimeInstanceFieldsLoaded.pending, (state, action) => {
        const normalizedAddress = formatHexAddress(action.meta.arg.instanceAddress);
        if (!normalizedAddress) {
          return;
        }
        const requestKey = `${action.meta.arg.classStableId}::${normalizedAddress}`;
        state.loadingRuntimeInstanceByKey[requestKey] = true;
        state.runtimeInstanceFieldErrorByKey[requestKey] = null;
      })
      .addCase(ensureRuntimeInstanceFieldsLoaded.fulfilled, (state, action) => {
        const normalizedAddress = formatHexAddress(action.payload.instanceAddress);
        if (!normalizedAddress) {
          return;
        }
        const requestKey = `${action.payload.classStableId}::${normalizedAddress}`;
        state.runtimeInstanceFieldSnapshots[requestKey] = action.payload;
        state.loadingRuntimeInstanceByKey[requestKey] = false;
        state.runtimeInstanceFieldErrorByKey[requestKey] = null;
      })
      .addCase(ensureRuntimeInstanceFieldsLoaded.rejected, (state, action) => {
        const normalizedAddress = formatHexAddress(action.meta.arg.instanceAddress);
        if (!normalizedAddress) {
          return;
        }
        const requestKey = `${action.meta.arg.classStableId}::${normalizedAddress}`;
        state.loadingRuntimeInstanceByKey[requestKey] = false;
        if (action.payload) {
          state.runtimeInstanceFieldErrorByKey[requestKey] = action.payload;
        }
      });
  },
});

export const workspaceActions = workspaceSlice.actions;
export const analysisActions = analysisSlice.actions;

export function createAppStore(services: AppServices) {
  const serializableCheckIgnoredActions = [
    loadAnalysisSnapshot.fulfilled.type,
    ensureRuntimeOverlayLoaded.fulfilled.type,
    ensureRuntimeInstanceFieldsLoaded.fulfilled.type,
  ];

  return configureStore({
    reducer: {
      workspace: workspaceSlice.reducer,
      analysis: analysisSlice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      thunk: {
        extraArgument: services,
      },
      serializableCheck: {
        ignoredPaths: [...SERIALIZABLE_CHECK_IGNORED_PATHS],
        ignoredActions: serializableCheckIgnoredActions,
        warnAfter: SERIALIZABLE_CHECK_WARN_AFTER_MS,
      },
    }),
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];

const selectWorkspaceState = (state: AppStateShape) => state.workspace;
const selectAnalysisState = (state: AppStateShape) => state.analysis;

export const selectActivePage = createSelector([selectWorkspaceState], (workspace) => workspace.activePage);
export const selectWorkspaceLifecycle = createSelector([selectWorkspaceState], (workspace) => workspace.lifecycle);
export const selectContractVersions = createSelector([selectWorkspaceState], (workspace) => workspace.contractVersions);
export const selectWorkspaceTasks = createSelector([selectWorkspaceState], (workspace) => {
  return Object.values(workspace.tasksBySource).flat();
});
export const selectWorkspaceFeedback = createSelector([selectWorkspaceState], (workspace) => workspace.feedback);

export const selectWorkspaceView = createSelector(
  [selectWorkspaceState, selectWorkspaceTasks],
  (workspace, workspaceTasks): WorkspaceViewState => {
    return createWorkspaceViewState({
      processSession: workspace.lifecycle.processSession,
      contractVersions: workspace.contractVersions,
      workspaceLifecycle: workspace.lifecycle,
      activePage: workspace.activePage,
      workspaceTasks,
      previousLifecycle: workspace.previousLifecycle,
    });
  },
);

export const selectWorkspacePresentation = createSelector(
  [selectWorkspaceView, selectWorkspaceFeedback],
  (workspaceView, feedback): WorkspacePresentation => {
    const presentation = createWorkspacePresentation(workspaceView);
    if (!feedback) {
      return presentation;
    }

    return {
      ...presentation,
      detailMessage: feedback.description,
    };
  },
);

export const selectAttachError = createSelector([selectAnalysisState], (analysis) => analysis.attachError);
export const selectAnalysisSnapshot = createSelector([selectAnalysisState], (analysis) => analysis.analysisSnapshot);
export const selectLoadingSnapshot = createSelector([selectAnalysisState], (analysis) => analysis.loadingSnapshot);
export const selectRuntimeOverlays = createSelector([selectAnalysisState], (analysis) => analysis.runtimeOverlays);
export const selectRuntimeFieldErrorMessages = createSelector([selectAnalysisState], (analysis) => {
  return Object.fromEntries(
    Object.entries(analysis.runtimeFieldErrorByKey).map(([key, error]) => [key, error?.message ?? null]),
  ) as Record<string, string | null>;
});
export const selectLoadingRuntimeByKey = createSelector([selectAnalysisState], (analysis) => analysis.loadingRuntimeByKey);
export const selectRuntimeInstanceFieldSnapshots = createSelector([selectAnalysisState], (analysis) => analysis.runtimeInstanceFieldSnapshots);
export const selectPendingClassNode = createSelector([selectAnalysisState], (analysis) => analysis.pendingClassNode);

export const selectImages = createSelector([selectAnalysisSnapshot], (analysisSnapshot) => analysisSnapshot?.images ?? []);

export const selectClassesByImage = createSelector(
  [selectAnalysisSnapshot, selectImages],
  (analysisSnapshot, images) => {
    if (!analysisSnapshot) {
      return {} as Record<string, ReturnType<typeof createAnalysisClassSummary>[]>;
    }

    const imagesByStableId = new Map<string, (typeof images)[number]>(images.map((image) => [image.stableId, image]));

    return Object.fromEntries(
      Object.entries(analysisSnapshot.imageClassIndex).map(([imageStableId, classStableIds]) => {
        const summaries = classStableIds
          .map((classStableId) => analysisSnapshot.classes[classStableId])
          .filter((descriptor): descriptor is NonNullable<typeof descriptor> => Boolean(descriptor))
          .map((descriptor) => createAnalysisClassSummary(
            imagesByStableId.get(imageStableId) ?? {
              stableId: descriptor.imageStableId,
              name: '',
              path: '',
            },
            descriptor,
          ));

        return [imageStableId, summaries];
      }),
    );
  },
);

export const selectClassDetailsByStableId = createSelector(
  [selectAnalysisSnapshot],
  (analysisSnapshot) => {
    if (!analysisSnapshot) {
      return {} as Record<string, ReturnType<typeof createAnalysisClassInfo>>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [descriptor.stableId, createAnalysisClassInfo(descriptor)]),
    );
  },
);

export const selectStudioClassCatalogEntries = createSelector(
  [selectImages, selectClassesByImage],
  (images, classesByImage) => buildStudioClassCatalog(images, classesByImage),
);

export const selectClassInfoCatalogByStableId = createSelector(
  [selectAnalysisSnapshot, selectRuntimeOverlays],
  (analysisSnapshot, runtimeOverlays) => {
    if (!analysisSnapshot) {
      return {} as Record<string, ReturnType<typeof createClassInfoCatalogFromClassDescriptor>>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [
        descriptor.stableId,
        createClassInfoCatalogFromClassDescriptor(descriptor, runtimeOverlays[descriptor.stableId]),
      ]),
    );
  },
);

export const selectStaticFieldAddressByClassAndMember = createSelector(
  [selectAnalysisSnapshot, selectRuntimeOverlays],
  (analysisSnapshot, runtimeOverlays) => {
    if (!analysisSnapshot) {
      return {} as Record<string, Record<string, string | null>>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => {
        const staticFields = runtimeOverlays[descriptor.stableId]?.staticFields ?? descriptor.staticFields;
        return [
          descriptor.stableId,
          Object.fromEntries(staticFields.map((field) => [field.stableId, formatHexAddress(field.address)])),
        ];
      }),
    );
  },
);

export const selectRuntimeMemberValuesByClassAndAddress = createSelector(
  [selectRuntimeInstanceFieldSnapshots],
  (runtimeInstanceFieldSnapshots) => {
    return Object.values(runtimeInstanceFieldSnapshots).reduce<Record<string, Record<string, Record<string, ResolvedMemberRuntimeValue>>>>((acc, snapshot) => {
      const normalizedAddress = formatHexAddress(snapshot.instanceAddress);
      if (!normalizedAddress) {
        return acc;
      }

      if (!acc[snapshot.classStableId]) {
        acc[snapshot.classStableId] = {};
      }

      acc[snapshot.classStableId]![normalizedAddress] = Object.fromEntries(snapshot.fields.map((field) => [field.stableId, {
        address: formatHexAddress(field.address),
        value: field.value,
      }]));

      return acc;
    }, {});
  },
);
