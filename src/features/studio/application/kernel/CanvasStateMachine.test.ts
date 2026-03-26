import { describe, expect, it } from 'vitest';
import { createInitialCanvasState } from '@/domain/studio/kernel';
import { isCanvasBusy, reduceCanvasState } from './CanvasStateMachine';

describe('CanvasStateMachine', () => {
  it('tracks marquee selection progress only while marquee mode is active', () => {
    const initial = createInitialCanvasState();
    const started = reduceCanvasState(initial, {
      type: 'begin-marquee',
      startX: 10,
      startY: 20,
    });

    const updated = reduceCanvasState(started, {
      type: 'update-marquee',
      currentX: 40,
      currentY: 50,
    });

    expect(updated.mode).toEqual({
      kind: 'marquee-selecting',
      startX: 10,
      startY: 20,
      currentX: 40,
      currentY: 50,
    });
    expect(isCanvasBusy(updated.mode)).toBe(true);
  });

  it('updates edge draft hover state without requiring React component state', () => {
    const initial = createInitialCanvasState();
    const connecting = reduceCanvasState(initial, {
      type: 'begin-connecting-edge',
      draft: {
        sourceNodeId: 'node-a',
        sourcePortKey: 'then',
        sourceChannel: 'control',
        targetX: 0,
        targetY: 0,
      },
    });

    const updated = reduceCanvasState(connecting, {
      type: 'update-draft-edge-target',
      targetX: 100,
      targetY: 200,
      hoveredTargetNodeId: 'node-b',
      hoveredTargetPortKey: 'in',
      hoveredTargetCompatible: true,
    });

    expect(updated.mode).toEqual({
      kind: 'connecting-edge',
      draft: {
        sourceNodeId: 'node-a',
        sourcePortKey: 'then',
        sourceChannel: 'control',
        targetX: 100,
        targetY: 200,
        hoveredTargetNodeId: 'node-b',
        hoveredTargetPortKey: 'in',
        hoveredTargetCompatible: true,
      },
    });
  });
});