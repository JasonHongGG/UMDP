import {
  createEmptyStudioDocument,
  createExecutionState,
  createInitialAnalysisSession,
  createInitialCanvasState,
  createInitialRuntimeSession,
  type AnalysisSession,
  type CanvasMode,
  type CanvasState,
  type ExecutionState,
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
  execution: ExecutionState;
  analysisSession: AnalysisSession;
  runtimeSession: RuntimeSession;
  editorSession: EditorSession | null;
}

export type StudioEngineCommand =
  | { type: 'replace-document'; document: StudioDocument }
  | { type: 'reset-execution' }
  | { type: 'open-editor'; nodeId: string; openedAt: number }
  | { type: 'close-editor' }
  | CanvasCommand;

export function createStudioEngineState(document: StudioDocument = createEmptyStudioDocument()): StudioEngineState {
  return {
    document,
    canvas: createInitialCanvasState(),
    execution: createExecutionState(),
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
        execution: createExecutionState(),
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

export function selectOpenEditorNodeId(state: StudioEngineState) {
  return state.editorSession?.nodeId ?? null;
}