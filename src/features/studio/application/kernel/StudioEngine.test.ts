import { describe, expect, it } from 'vitest';
import { createEmptyStudioDocument, createTraceEvent } from '@/domain/studio/kernel';
import {
  createStudioEngineState,
  reduceStudioEngineState,
  selectCanvasMode,
  selectExecutionEventsForRun,
  selectLatestRun,
  selectOpenEditorNodeId,
  selectRunHistory,
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

  it('tracks execution runs inside a single engine state tree', () => {
    const initial = createStudioEngineState(createEmptyStudioDocument('doc-1'));
    const started = reduceStudioEngineState(initial, {
      type: 'begin-run',
      run: {
        runId: 'run-1',
        startNodeId: 'trigger-1',
        status: 'running',
        startedAt: 10,
      },
      event: createTraceEvent('run-1', 1, 'run-started', 10),
    });

    const completed = reduceStudioEngineState(started, {
      type: 'complete-run',
      runId: 'run-1',
      status: 'success',
      completedAt: 20,
      event: createTraceEvent('run-1', 2, 'run-completed', 20),
    });

    expect(completed.execution.activeRunId).toBeNull();
    expect(selectLatestRun(completed)).toMatchObject({ runId: 'run-1', status: 'success' });
    expect(selectRunHistory(completed)).toHaveLength(1);
    expect(completed.execution.runsById['run-1']).toMatchObject({ status: 'success', completedAt: 20 });
    expect(selectExecutionEventsForRun(completed, 'run-1')).toHaveLength(2);
  });
});