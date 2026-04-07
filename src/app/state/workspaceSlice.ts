import { createSlice, type AsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { ActivePage } from '@/domain/analysis/workspace-types';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import type {
  OperationFeedbackEnvelope,
  SystemContractVersions,
  WorkspaceLifecycleState,
  WorkspaceTaskSnapshot,
} from '@/shared/contracts';
import type { ThunkConfig, WorkspaceSliceState } from './types';

const ATTACH_TO_PROCESS_REJECTED = 'workspace/attachToProcess/rejected';

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

interface WorkspaceThunkReferences {
  loadContractVersions: AsyncThunk<SystemContractVersions, void, ThunkConfig>;
  refreshWorkspaceLifecycle: AsyncThunk<WorkspaceLifecycleState, string | undefined, ThunkConfig>;
}

export function createWorkspaceSlice({
  loadContractVersions,
  refreshWorkspaceLifecycle,
}: WorkspaceThunkReferences) {
  return createSlice({
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
      replaceLifecycle(state, action: PayloadAction<WorkspaceLifecycleState>) {
        state.previousLifecycle = state.lifecycle;
        state.lifecycle = action.payload;
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
        .addMatcher(
          (action): action is PayloadAction<{ message: string }> => action.type === ATTACH_TO_PROCESS_REJECTED,
          (state, action) => {
            const message = action.payload?.message;
            if (!message) {
              return;
            }

            state.feedback = {
              operationKey: 'workspace.attach-to-process',
              tone: 'error',
              title: 'Attach Failed',
              description: message,
              targetId: null,
              timestamp: new Date().toISOString(),
            };
          },
        );
    },
  });
}