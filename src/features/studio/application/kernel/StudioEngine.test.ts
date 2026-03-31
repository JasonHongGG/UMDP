import { describe, expect, it } from 'vitest';
import {
  createStudioEngineState,
  reduceStudioEngineState,
  selectCanvasMode,
  selectOpenEditorNodeId,
} from './StudioEngine';

describe('StudioEngine foundation', () => {
  it('opens and closes editor sessions without depending on React context', () => {
    const initial = createStudioEngineState();
    const opened = reduceStudioEngineState(initial, {
      type: 'open-editor',
      nodeId: 'display-1',
      openedAt: 100,
    });

    expect(selectOpenEditorNodeId(opened)).toBe('display-1');
    expect(selectCanvasMode(opened)).toEqual({ kind: 'editing-node', nodeId: 'display-1' });

    const closed = reduceStudioEngineState(opened, { type: 'close-editor' });

    expect(selectOpenEditorNodeId(closed)).toBeNull();
    expect(selectCanvasMode(closed)).toEqual({ kind: 'idle' });
  });

  it('resets transient execution state without tracking run history', () => {
    const initial = createStudioEngineState();
    const reset = reduceStudioEngineState(initial, { type: 'reset-execution' });

    expect(reset.execution.isExecuting).toBe(false);
  });
});