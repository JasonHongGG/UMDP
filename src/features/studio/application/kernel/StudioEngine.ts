import {
  createEmptyStudioDocument,
  createExecutionTraceState,
  createInitialAnalysisSession,
  createInitialCanvasState,
  createInitialRuntimeSession,
  type AnalysisSession,
  type CanvasMode,
  type CanvasState,
  type ExecutionRun,
  type ExecutionTraceEvent,
  type ExecutionTraceState,
  type RuntimeSession,
  type StudioDocument,
} from '@/domain/studio/kernel';
import { reduceCanvasState, type CanvasCommand } from './CanvasStateMachine';

export interface EditorSession {
  nodeId: string;
  openedAt: number;
}

export interface StudioEngineState {
  document: StudioDocument;
  canvas: CanvasState;
  execution: ExecutionTraceState;
  analysisSession: AnalysisSession;
  runtimeSession: RuntimeSession;
  editorSession: EditorSession | null;
}

export type StudioEngineCommand =
  | { type: 'replace-document'; document: StudioDocument }
  | { type: 'reset-execution' }
  | { type: 'open-editor'; nodeId: string; openedAt: number }
  | { type: 'close-editor' }
  | { type: 'begin-run'; run: ExecutionRun; event: ExecutionTraceEvent }
  | { type: 'append-trace-event'; event: ExecutionTraceEvent }
  | { type: 'complete-run'; runId: string; status: ExecutionRun['status']; completedAt: number; event?: ExecutionTraceEvent }
  | CanvasCommand;

export function createStudioEngineState(document: StudioDocument = createEmptyStudioDocument()): StudioEngineState {
  return {
    document,
    canvas: createInitialCanvasState(),
    execution: createExecutionTraceState(),
    analysisSession: createInitialAnalysisSession(),
    runtimeSession: createInitialRuntimeSession(),
    editorSession: null,
  };
}

export function reduceStudioEngineState(
  state: StudioEngineState,
  command: StudioEngineCommand,
): StudioEngineState {
  switch (command.type) {
    case 'replace-document':
      return {
        ...state,
        document: command.document,
      };

    case 'reset-execution':
      return {
        ...state,
        execution: createExecutionTraceState(),
      };

    case 'open-editor':
      return {
        ...state,
        editorSession: {
          nodeId: command.nodeId,
          openedAt: command.openedAt,
        },
        canvas: reduceCanvasState(state.canvas, { type: 'open-node-editor', nodeId: command.nodeId }),
      };

    case 'close-editor':
      return {
        ...state,
        editorSession: null,
        canvas: reduceCanvasState(state.canvas, { type: 'return-to-idle' }),
      };

    case 'begin-run':
      return {
        ...state,
        execution: {
          activeRunId: command.run.runId,
          runOrder: [command.run.runId, ...state.execution.runOrder.filter((runId) => runId !== command.run.runId)],
          runsById: {
            ...state.execution.runsById,
            [command.run.runId]: command.run,
          },
          eventsByRunId: {
            ...state.execution.eventsByRunId,
            [command.run.runId]: [...(state.execution.eventsByRunId[command.run.runId] ?? []), command.event],
          },
          nodeTracesByRunId: {
            ...state.execution.nodeTracesByRunId,
            [command.run.runId]: state.execution.nodeTracesByRunId[command.run.runId] ?? {},
          },
        },
      };

    case 'append-trace-event':
      return {
        ...state,
        execution: {
          ...state.execution,
          eventsByRunId: {
            ...state.execution.eventsByRunId,
            [command.event.runId]: [...(state.execution.eventsByRunId[command.event.runId] ?? []), command.event],
          },
        },
      };

    case 'complete-run': {
      const run = state.execution.runsById[command.runId];
      if (!run) {
        return state;
      }

      return {
        ...state,
        execution: {
          ...state.execution,
          activeRunId: state.execution.activeRunId === command.runId ? null : state.execution.activeRunId,
          runsById: {
            ...state.execution.runsById,
            [command.runId]: {
              ...run,
              status: command.status,
              completedAt: command.completedAt,
            },
          },
          eventsByRunId: command.event
            ? {
              ...state.execution.eventsByRunId,
              [command.runId]: [...(state.execution.eventsByRunId[command.runId] ?? []), command.event],
            }
            : state.execution.eventsByRunId,
        },
      };
    }

    default:
      return {
        ...state,
        canvas: reduceCanvasState(state.canvas, command),
      };
  }
}

export function selectCanvasMode(state: StudioEngineState): CanvasMode {
  return state.canvas.mode;
}

export function selectLatestRun(state: StudioEngineState) {
  const latestRunId = state.execution.runOrder[0];
  return latestRunId ? state.execution.runsById[latestRunId] ?? null : null;
}

export function selectRunHistory(state: StudioEngineState) {
  return state.execution.runOrder
    .map((runId) => state.execution.runsById[runId])
    .filter((run): run is ExecutionRun => Boolean(run));
}

export function selectOpenEditorNodeId(state: StudioEngineState) {
  return state.editorSession?.nodeId ?? null;
}

export function selectExecutionEventsForRun(state: StudioEngineState, runId: string) {
  return state.execution.eventsByRunId[runId] ?? [];
}