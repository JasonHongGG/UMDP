import { createSlice, type AsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeInstanceFieldSnapshot,
} from '@/domain/analysis/contracts';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import { formatHexAddress } from '@/core/addressFormat';
import type { ThunkConfig, AnalysisSliceState } from './types';
import type { WorkspaceLifecycleState } from '@/shared/contracts';

const ATTACH_TO_PROCESS_REJECTED = 'workspace/attachToProcess/rejected';

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

interface AnalysisThunkReferences {
  loadAnalysisSnapshot: AsyncThunk<AnalysisSnapshot, ProcessSession | null, ThunkConfig>;
  refreshWorkspaceLifecycle: AsyncThunk<WorkspaceLifecycleState, string | undefined, ThunkConfig>;
  ensureRuntimeOverlayLoaded: AsyncThunk<RuntimeClassOverlayDescriptor, string, ThunkConfig>;
  ensureRuntimeInstanceFieldsLoaded: AsyncThunk<RuntimeInstanceFieldSnapshot, { classStableId: string; instanceAddress: string }, ThunkConfig>;
}

export function createAnalysisSlice({
  loadAnalysisSnapshot,
  refreshWorkspaceLifecycle,
  ensureRuntimeOverlayLoaded,
  ensureRuntimeInstanceFieldsLoaded,
}: AnalysisThunkReferences) {
  return createSlice({
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
      builder.addCase(loadAnalysisSnapshot.pending, (state) => {
        state.loadingSnapshot = true;
        state.attachError = null;
        state.analysisSnapshot = null;
      });

      builder.addCase(loadAnalysisSnapshot.fulfilled, (state, action) => {
        state.loadingSnapshot = false;
        state.analysisSnapshot = action.payload;
      });

      builder.addCase(loadAnalysisSnapshot.rejected, (state, action) => {
        state.loadingSnapshot = false;
        state.attachError = action.payload ?? null;
      });

      builder.addCase(refreshWorkspaceLifecycle.fulfilled, (state, action) => {
        if (!action.payload.processSession) {
          state.analysisSnapshot = null;
          state.pendingClassNode = null;
        }

        if (shouldClearRuntimeState(action.payload)) {
          clearRuntimeCaches(state);
        }
      });

      builder.addCase(ensureRuntimeOverlayLoaded.pending, (state, action) => {
        state.loadingRuntimeByKey[action.meta.arg] = true;
        state.runtimeFieldErrorByKey[action.meta.arg] = null;
      });

      builder.addCase(ensureRuntimeOverlayLoaded.fulfilled, (state, action) => {
        state.runtimeOverlays[action.payload.classStableId] = action.payload;
        state.loadingRuntimeByKey[action.payload.classStableId] = false;
        state.runtimeFieldErrorByKey[action.payload.classStableId] = null;
      });

      builder.addCase(ensureRuntimeOverlayLoaded.rejected, (state, action) => {
        state.loadingRuntimeByKey[action.meta.arg] = false;
        if (action.payload) {
          state.runtimeFieldErrorByKey[action.meta.arg] = action.payload;
        }
      });

      builder.addCase(ensureRuntimeInstanceFieldsLoaded.pending, (state, action) => {
        const normalizedAddress = formatHexAddress(action.meta.arg.instanceAddress);
        if (!normalizedAddress) {
          return;
        }
        const requestKey = `${action.meta.arg.classStableId}::${normalizedAddress}`;
        state.loadingRuntimeInstanceByKey[requestKey] = true;
        state.runtimeInstanceFieldErrorByKey[requestKey] = null;
      });

      builder.addCase(ensureRuntimeInstanceFieldsLoaded.fulfilled, (state, action) => {
        const normalizedAddress = formatHexAddress(action.payload.instanceAddress);
        if (!normalizedAddress) {
          return;
        }
        const requestKey = `${action.payload.classStableId}::${normalizedAddress}`;
        state.runtimeInstanceFieldSnapshots[requestKey] = action.payload;
        state.loadingRuntimeInstanceByKey[requestKey] = false;
        state.runtimeInstanceFieldErrorByKey[requestKey] = null;
      });

      builder.addCase(ensureRuntimeInstanceFieldsLoaded.rejected, (state, action) => {
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

      builder.addMatcher(
        (action): action is PayloadAction<unknown> => action.type === ATTACH_TO_PROCESS_REJECTED,
        (state, action) => {
          state.attachError = (action.payload as AnalysisSliceState['attachError']) ?? null;
          state.analysisSnapshot = null;
          state.pendingClassNode = null;
          clearRuntimeCaches(state);
        },
      );
    },
  });
}