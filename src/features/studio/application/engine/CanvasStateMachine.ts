import type { CanvasDraftEdge, CanvasMode, CanvasState, CanvasViewport } from '@/domain/studio/kernel';

export type CanvasCommand =
  | { type: 'reset' }
  | { type: 'set-viewport'; viewport: CanvasViewport }
  | { type: 'select-nodes'; nodeIds: string[] }
  | { type: 'begin-adding-node'; canvasX: number; canvasY: number }
  | { type: 'begin-panning'; originX: number; originY: number }
  | { type: 'update-panning'; originX: number; originY: number }
  | { type: 'begin-marquee'; startX: number; startY: number }
  | { type: 'update-marquee'; currentX: number; currentY: number }
  | { type: 'begin-dragging-nodes'; nodeIds: string[] }
  | { type: 'begin-connecting-edge'; draft: CanvasDraftEdge }
  | {
    type: 'update-draft-edge-target';
    targetX: number;
    targetY: number;
    hoveredTargetNodeId?: string;
    hoveredTargetPortKey?: string;
    hoveredTargetCompatible?: boolean;
  }
  | { type: 'open-node-editor'; nodeId: string }
  | { type: 'return-to-idle' };

export function reduceCanvasState(state: CanvasState, command: CanvasCommand): CanvasState {
  switch (command.type) {
    case 'reset':
      return {
        viewport: { x: 0, y: 0, scale: 1 },
        selectedNodeIds: [],
        mode: { kind: 'idle' },
      };

    case 'set-viewport':
      return {
        ...state,
        viewport: command.viewport,
      };

    case 'select-nodes':
      return {
        ...state,
        selectedNodeIds: [...command.nodeIds],
      };

    case 'begin-adding-node':
      return {
        ...state,
        mode: { kind: 'adding-node', canvasX: command.canvasX, canvasY: command.canvasY },
      };

    case 'begin-panning':
      return {
        ...state,
        mode: { kind: 'panning', originX: command.originX, originY: command.originY },
      };

    case 'update-panning':
      if (state.mode.kind !== 'panning') {
        return state;
      }

      return {
        ...state,
        mode: { kind: 'panning', originX: command.originX, originY: command.originY },
      };

    case 'begin-marquee':
      return {
        ...state,
        mode: {
          kind: 'marquee-selecting',
          startX: command.startX,
          startY: command.startY,
          currentX: command.startX,
          currentY: command.startY,
        },
      };

    case 'update-marquee':
      if (state.mode.kind !== 'marquee-selecting') {
        return state;
      }

      return {
        ...state,
        mode: {
          ...state.mode,
          currentX: command.currentX,
          currentY: command.currentY,
        },
      };

    case 'begin-dragging-nodes':
      return {
        ...state,
        selectedNodeIds: [...command.nodeIds],
        mode: { kind: 'dragging-nodes', nodeIds: [...command.nodeIds] },
      };

    case 'begin-connecting-edge':
      return {
        ...state,
        mode: { kind: 'connecting-edge', draft: command.draft },
      };

    case 'update-draft-edge-target':
      if (state.mode.kind !== 'connecting-edge') {
        return state;
      }

      return {
        ...state,
        mode: {
          kind: 'connecting-edge',
          draft: {
            ...state.mode.draft,
            targetX: command.targetX,
            targetY: command.targetY,
            hoveredTargetNodeId: command.hoveredTargetNodeId,
            hoveredTargetPortKey: command.hoveredTargetPortKey,
            hoveredTargetCompatible: command.hoveredTargetCompatible,
          },
        },
      };

    case 'open-node-editor':
      return {
        ...state,
        mode: { kind: 'editing-node', nodeId: command.nodeId },
      };

    case 'return-to-idle':
      return {
        ...state,
        mode: { kind: 'idle' },
      };

    default:
      return state;
  }
}

export function isCanvasBusy(mode: CanvasMode) {
  return mode.kind !== 'idle';
}