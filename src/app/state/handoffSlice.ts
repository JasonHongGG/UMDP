import { createSlice, type AsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import type { HandoffSliceState, ThunkConfig } from './types';

const ATTACH_TO_PROCESS_REJECTED = 'workspace/attachToProcess/rejected';

const initialHandoffState: HandoffSliceState = {
  pendingClassNode: null,
};

interface HandoffThunkReferences {
  refreshWorkspaceLifecycle: AsyncThunk<WorkspaceLifecycleState, string | undefined, ThunkConfig>;
}

export function createHandoffSlice({
  refreshWorkspaceLifecycle,
}: HandoffThunkReferences) {
  return createSlice({
    name: 'handoff',
    initialState: initialHandoffState,
    reducers: {
      queuePendingClassNode(state, action: PayloadAction<PendingClassNodeRequest>) {
        state.pendingClassNode = action.payload;
      },
      clearPendingClassNode(state) {
        state.pendingClassNode = null;
      },
      resetStudioHandoffs(state) {
        state.pendingClassNode = null;
      },
    },
    extraReducers: (builder) => {
      builder.addCase(refreshWorkspaceLifecycle.fulfilled, (state, action) => {
        if (!action.payload.processSession) {
          state.pendingClassNode = null;
        }
      });

      builder.addMatcher(
        (action): action is PayloadAction<unknown> => action.type === ATTACH_TO_PROCESS_REJECTED,
        (state) => {
          state.pendingClassNode = null;
        },
      );
    },
  });
}