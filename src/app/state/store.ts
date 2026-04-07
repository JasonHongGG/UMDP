import {
  configureStore,
  createAsyncThunk,
  createSelector,
} from '@reduxjs/toolkit';
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
import { buildStudioClassCatalog, createClassInfoCatalogFromClassDescriptor } from '@/domain/studio/editor';
import type { ResolvedMemberRuntimeValue } from '@/domain/studio/runtime';
import {
  createAttachedWithoutSnapshotLifecycle,
  createAttachFailureWorkspaceLifecycle,
  createAttachingWorkspaceLifecycle,
  EMPTY_WORKSPACE_LIFECYCLE,
} from '@/app/shell/workspaceLifecycle';
import {
  createWorkspacePresentation,
  createWorkspaceViewState,
  type WorkspacePresentation,
  type WorkspaceViewState,
} from '@/domain/workspace/presentation';
import type {
  OperationErrorEnvelope,
  SystemContractVersions,
  WorkspaceLifecycleState,
} from '@/shared/contracts';
import { coerceOperationErrorEnvelope } from '@/shared/contracts';
import { formatHexAddress } from '@/core/addressFormat';
import { createAnalysisSlice } from './analysisSlice';
import type {
  AppServices,
  AppStateShape,
  ThunkConfig,
} from './types';
import { createHandoffSlice } from './handoffSlice';
import { createWorkspaceSlice } from './workspaceSlice';

const SERIALIZABLE_CHECK_IGNORED_PATHS = [
  'analysis.analysisSnapshot',
  'analysis.runtimeOverlays',
  'analysis.runtimeInstanceFieldSnapshots',
] as const;

const SERIALIZABLE_CHECK_WARN_AFTER_MS = 1000;

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

const workspaceSlice = createWorkspaceSlice({
  loadContractVersions,
  refreshWorkspaceLifecycle,
});

const analysisSlice = createAnalysisSlice({
  loadAnalysisSnapshot,
  refreshWorkspaceLifecycle,
  ensureRuntimeOverlayLoaded,
  ensureRuntimeInstanceFieldsLoaded,
});

const handoffSlice = createHandoffSlice({
  refreshWorkspaceLifecycle,
});

export const workspaceActions = workspaceSlice.actions;
export const analysisActions = analysisSlice.actions;
export const handoffActions = handoffSlice.actions;

export const attachToProcess = createAsyncThunk<ProcessSession, ProcessInfo, ThunkConfig>(
  'workspace/attachToProcess',
  async (process, { dispatch, extra, rejectWithValue }) => {
    dispatch(workspaceActions.replaceLifecycle(createAttachingWorkspaceLifecycle()));
    dispatch(workspaceActions.clearWorkspaceTasks());
    dispatch(analysisActions.resetForSession());
    dispatch(handoffActions.resetStudioHandoffs());

    try {
      const session = await extra.analysisRepository.attachToProcess({
        pid: process.pid,
        name: process.name,
      });

      dispatch(workspaceActions.replaceLifecycle(createAttachedWithoutSnapshotLifecycle(session)));

      await dispatch(refreshWorkspaceLifecycle('workspace.after-attach')).unwrap();
      await dispatch(loadAnalysisSnapshot(session)).unwrap();
      return session;
    } catch (error) {
      const envelope = coerceOperationErrorEnvelope(error, 'workspace.attach-to-process');
      dispatch(workspaceActions.replaceLifecycle(createAttachFailureWorkspaceLifecycle(envelope.message)));
      return rejectWithValue(envelope);
    }
  },
);

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
      handoff: handoffSlice.reducer,
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
const selectHandoffState = (state: AppStateShape) => state.handoff;

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
export const selectPendingClassNode = createSelector([selectHandoffState], (handoff) => handoff.pendingClassNode);

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
