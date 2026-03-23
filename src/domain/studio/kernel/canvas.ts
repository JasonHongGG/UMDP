export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasDraftEdge {
  sourceNodeId: string;
  sourcePortKey: string;
  sourceChannel: 'control' | 'data';
  targetX: number;
  targetY: number;
  hoveredTargetNodeId?: string;
  hoveredTargetPortKey?: string;
  hoveredTargetCompatible?: boolean;
}

export type CanvasMode =
  | { kind: 'idle' }
  | { kind: 'panning'; originX: number; originY: number }
  | { kind: 'marquee-selecting'; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: 'dragging-nodes'; nodeIds: string[] }
  | { kind: 'connecting-edge'; draft: CanvasDraftEdge }
  | { kind: 'adding-node'; canvasX: number; canvasY: number }
  | { kind: 'editing-node'; nodeId: string };

export interface CanvasState {
  viewport: CanvasViewport;
  selectedNodeIds: string[];
  mode: CanvasMode;
}

export function createInitialCanvasState(): CanvasState {
  return {
    viewport: { x: 0, y: 0, scale: 1 },
    selectedNodeIds: [],
    mode: { kind: 'idle' },
  };
}