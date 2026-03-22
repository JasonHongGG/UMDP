import { describe, expect, it } from 'vitest';
import { createInputExpressionSource, createLiteralExpressionSource } from '../../core/studio/expression';
import ForLoopNodeDef from './ForLoopNode';
import {
  buildForLoopIterationPayload,
  createForLoopNodeData,
  parseForLoopExecutionState,
  parseForLoopNodeDataFromDocumentState,
  parseLoopCountValue,
  toForLoopNodeDocumentState,
} from './forLoopNodeModel';

describe('ForLoopNode', () => {
  it('creates a default count-based node model', () => {
    expect(createForLoopNodeData()).toMatchObject({
      countSource: createLiteralExpressionSource('1', 'number'),
    });
  });

  it('allows flow-in to accept both entry and loop-back control connections', () => {
    expect(ForLoopNodeDef.manifest.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'flow-in',
        cardinality: 'multiple',
      }),
    ]));
  });

  it('hydrates from persisted document state', () => {
    const hydrated = parseForLoopNodeDataFromDocumentState({ nodeName: 'Existing Loop' }, {
      id: 'for-loop-1',
      nodeType: 'for-loop',
      typeVersion: 1,
      position: { x: 0, y: 0 },
      displayName: 'Existing Loop',
      parameters: {},
      bindings: {},
      documentState: {
        countSource: createInputExpressionSource('params-1', 'params-out', ['count'], 'params.count'),
      },
    });

    expect(hydrated.countSource).toMatchObject({
      kind: 'input-expression',
      sourceNodeId: 'params-1',
    });
  });

  it('serializes to document state', () => {
    expect(toForLoopNodeDocumentState({
      nodeName: 'Loop',
      countSource: createLiteralExpressionSource('3', 'number'),
    })).toEqual({
      countSource: createLiteralExpressionSource('3', 'number'),
    });
  });

  it('parses loop counts from integers and rejects invalid values', () => {
    expect(parseLoopCountValue('3')).toEqual({ valid: true, value: 3 });
    expect(parseLoopCountValue(0)).toEqual({ valid: true, value: 0 });
    expect(parseLoopCountValue('1.5')).toEqual({ valid: false, reason: 'not-an-integer' });
    expect(parseLoopCountValue('-1')).toEqual({ valid: false, reason: 'negative' });
    expect(parseLoopCountValue('abc')).toEqual({ valid: false, reason: 'not-a-number' });
  });

  it('builds an iteration payload with first and last flags', () => {
    expect(buildForLoopIterationPayload(0, 3)).toEqual({
      index: 0,
      totalCount: 3,
      isFirstIteration: true,
      isLastIteration: false,
    });
    expect(buildForLoopIterationPayload(2, 3)).toEqual({
      index: 2,
      totalCount: 3,
      isFirstIteration: false,
      isLastIteration: true,
    });
  });

  it('parses runtime execution state defensively', () => {
    expect(parseForLoopExecutionState({ currentIndex: 1, totalCount: 3 })).toEqual({ currentIndex: 1, totalCount: 3 });
    expect(parseForLoopExecutionState({ currentIndex: 'bad', totalCount: 3 })).toEqual({ totalCount: 3 });
    expect(parseForLoopExecutionState(null)).toEqual({});
  });

  it('routes to done immediately when count is zero', async () => {
    const result = await ForLoopNodeDef.executionContract!.execute({
      documentId: 'doc-1',
      nodeId: 'loop-1',
      nodeType: 'for-loop',
      parameters: {},
      bindings: {},
      resolvedBindings: {
        countSource: 0,
      },
      documentState: {
        countSource: createLiteralExpressionSource('0', 'number'),
      },
      runtimeState: {},
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(result).toMatchObject({
      state: 'success',
      nextControlPorts: ['done-out'],
      nextRuntimeState: {},
    });
  });

  it('emits iteration payloads and advances runtime state while looping', async () => {
    const first = await ForLoopNodeDef.executionContract!.execute({
      documentId: 'doc-1',
      nodeId: 'loop-1',
      nodeType: 'for-loop',
      parameters: {},
      bindings: {},
      resolvedBindings: {
        countSource: 3,
      },
      documentState: {
        countSource: createLiteralExpressionSource('3', 'number'),
      },
      runtimeState: {},
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(first).toMatchObject({
      state: 'success',
      nextControlPorts: ['loop-out'],
      nextRuntimeState: { currentIndex: 0, totalCount: 3 },
    });
    const firstIterationPayload = (first.outputs?.['iteration-out'] as { payload?: unknown } | undefined)?.payload;
    expect(firstIterationPayload).toEqual({
      index: 0,
      totalCount: 3,
      isFirstIteration: true,
      isLastIteration: false,
    });

    const second = await ForLoopNodeDef.executionContract!.execute({
      documentId: 'doc-1',
      nodeId: 'loop-1',
      nodeType: 'for-loop',
      parameters: {},
      bindings: {},
      resolvedBindings: {
        countSource: 3,
      },
      documentState: {
        countSource: createLiteralExpressionSource('3', 'number'),
      },
      runtimeState: { currentIndex: 0, totalCount: 3 },
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(second).toMatchObject({
      state: 'success',
      nextControlPorts: ['loop-out'],
      nextRuntimeState: { currentIndex: 1, totalCount: 3 },
    });

    const done = await ForLoopNodeDef.executionContract!.execute({
      documentId: 'doc-1',
      nodeId: 'loop-1',
      nodeType: 'for-loop',
      parameters: {},
      bindings: {},
      resolvedBindings: {
        countSource: 3,
      },
      documentState: {
        countSource: createLiteralExpressionSource('3', 'number'),
      },
      runtimeState: { currentIndex: 2, totalCount: 3 },
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(done).toMatchObject({
      state: 'success',
      nextControlPorts: ['done-out'],
      nextRuntimeState: {},
    });
  });
});