import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiteralExpressionSource } from './expression';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createEnvelope, GENERIC_JSON_SCHEMA } from './contracts';
import { executeStudioFlow } from '../../application/studio/runtime/executeStudioFlow';
import { NodeExecutionSnapshot, StudioNodeDefinition } from './types';
import ForLoopNodeDef from '../../nodes/ForLoopNode/ForLoopNode';

describe('executeStudioFlow', () => {
  afterEach(() => {
    vi.useRealTimers();
    initializeStudioNodeRegistry([]);
  });

  it('uses definition-level validation instead of hardcoded node types', async () => {
    vi.useFakeTimers();
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const executeSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));
    const guardedNode: StudioNodeDefinition = {
      manifest: {
        type: 'guarded',
        typeVersion: 1,
        family: 'control',
        displayName: 'Guarded',
        description: 'Guarded test node',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [{ severity: 'error', code: 'guard.blocked', message: 'Guard rejected execution.' }],
        execute: executeSpy,
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([guardedNode]);

    const snapshots: Array<{ status: string; errorMessage?: string; failureReason?: string }> = [];
    executeStudioFlow({
      startNodeId: 'guarded-1',
      nodes: [
        {
          id: 'guarded-1',
          type: 'guarded',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots.push({ status: snapshot.status, errorMessage: snapshot.errorMessage, failureReason: snapshot.failureReason });
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(executeSpy).not.toHaveBeenCalled();
    expect(snapshots).toContainEqual({ status: 'error', errorMessage: 'Guard rejected execution.', failureReason: 'validation-error' });
    expect(consoleLogSpy).toHaveBeenCalledWith('[StudioFrontendError]', expect.objectContaining({
      nodeId: 'guarded-1',
      phase: 'validate',
      reason: 'validation-error',
      message: 'Guard rejected execution.',
    }));

    consoleLogSpy.mockRestore();
  });

  it('publishes aborted snapshots and run completion reason when an active node is cancelled', async () => {
    vi.useFakeTimers();

    const hangingNode: StudioNodeDefinition = {
      manifest: {
        type: 'hanging',
        typeVersion: 1,
        family: 'control',
        displayName: 'Hanging',
        description: 'Waits until aborted',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: ({ abortSignal }) => new Promise((_resolve, reject) => {
          const abortHandler = () => {
            const error = new Error('Execution cancelled.');
            error.name = 'AbortError';
            reject(error);
          };

          if (abortSignal?.aborted) {
            abortHandler();
            return;
          }

          abortSignal?.addEventListener('abort', abortHandler, { once: true });
        }),
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([hangingNode]);

    const snapshots: Array<{ status: string; errorMessage?: string; failureReason?: string; abortReason?: string }> = [];
    const runComplete = vi.fn();

    const cleanup = executeStudioFlow({
      startNodeId: 'hang-1',
      nodes: [
        {
          id: 'hang-1',
          type: 'hanging',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots.push({
          status: snapshot.status,
          errorMessage: snapshot.errorMessage,
          failureReason: snapshot.failureReason,
          abortReason: snapshot.abortReason,
        });
      },
      onRunComplete: runComplete,
      stepDelayMs: 0,
    });

    await vi.runAllTimersAsync();
    cleanup('rerun');
    await vi.runAllTimersAsync();

    expect(snapshots).toContainEqual({
      status: 'aborted',
      errorMessage: 'Execution aborted by rerun.',
      failureReason: 'aborted',
      abortReason: 'rerun',
    });
    expect(runComplete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'aborted',
      abortReason: 'rerun',
    }));
  });

  it('materializes passive json provider nodes for downstream inputs without flow edges', async () => {
    vi.useFakeTimers();

    const parameterNode: StudioNodeDefinition = {
      manifest: {
        type: 'params',
        typeVersion: 1,
        family: 'data',
        displayName: 'Parameters',
        description: 'Passive parameter provider',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'params-out', displayName: 'Params', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({
          state: 'success',
          outputs: {
            'params-out': createEnvelope(GENERIC_JSON_SCHEMA, { instanceAddress: '0x1234' }),
          },
        }),
      },
      CanvasComponent: () => null,
    };

    const consumerExecute = vi.fn(({ resolvedInputs }) => ({
      state: 'success' as const,
      outputs: {
        'json-out': createEnvelope(GENERIC_JSON_SCHEMA, { received: resolvedInputs['json-in']?.[0] ?? null }),
      },
    }));

    const consumerNode: StudioNodeDefinition = {
      manifest: {
        type: 'consumer',
        typeVersion: 1,
        family: 'runtime',
        displayName: 'Consumer',
        description: 'Consumes JSON input',
        category: 'Test',
        inputs: [
          { key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' },
          { key: 'json-in', displayName: 'Json In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id },
        ],
        outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: consumerExecute,
      },
      CanvasComponent: () => null,
    };

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, parameterNode, consumerNode]);

    const seenSnapshots: Record<string, unknown> = {};

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'params-1',
          type: 'params',
          position: { x: 120, y: 0 },
          data: {},
        },
        {
          id: 'consumer-1',
          type: 'consumer',
          position: { x: 240, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge-flow',
          channel: 'control',
          sourceNodeId: 'trigger-1',
          sourcePortId: 'flow-out',
          targetNodeId: 'consumer-1',
          targetPortId: 'flow-in',
        },
        {
          id: 'edge-json',
          channel: 'data',
          sourceNodeId: 'params-1',
          sourcePortId: 'params-out',
          targetNodeId: 'consumer-1',
          targetPortId: 'json-in',
        },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        seenSnapshots[snapshot.nodeId] = snapshot.outputs;
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(consumerExecute).toHaveBeenCalled();
    expect(seenSnapshots['params-1']).toEqual({
      'params-out': createEnvelope(GENERIC_JSON_SCHEMA, { instanceAddress: '0x1234' }),
    });
  });

  it('supports async passive json provider nodes before downstream execution', async () => {
    vi.useFakeTimers();

    const asyncParameterNode: StudioNodeDefinition = {
      manifest: {
        type: 'async-params',
        typeVersion: 1,
        family: 'data',
        displayName: 'Async Parameters',
        description: 'Async passive parameter provider',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'params-out', displayName: 'Params', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: async () => ({
          state: 'success',
          outputs: {
            'params-out': createEnvelope(GENERIC_JSON_SCHEMA, { instanceAddress: '0x9999' }),
          },
        }),
      },
      CanvasComponent: () => null,
    };

    const consumerExecute = vi.fn(({ resolvedInputs }) => ({
      state: 'success' as const,
      outputs: {
        'json-out': createEnvelope(GENERIC_JSON_SCHEMA, { received: resolvedInputs['json-in']?.[0] ?? null }),
      },
    }));

    const consumerNode: StudioNodeDefinition = {
      manifest: {
        type: 'consumer',
        typeVersion: 1,
        family: 'runtime',
        displayName: 'Consumer',
        description: 'Consumes JSON input',
        category: 'Test',
        inputs: [
          { key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' },
          { key: 'json-in', displayName: 'Json In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id },
        ],
        outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: consumerExecute,
      },
      CanvasComponent: () => null,
    };

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, asyncParameterNode, consumerNode]);

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'params-1', type: 'async-params', position: { x: 120, y: 0 }, data: {} },
        { id: 'consumer-1', type: 'consumer', position: { x: 240, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge-flow', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'consumer-1', targetPortId: 'flow-in' },
        { id: 'edge-json', channel: 'data', sourceNodeId: 'params-1', sourcePortId: 'params-out', targetNodeId: 'consumer-1', targetPortId: 'json-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(consumerExecute).toHaveBeenCalledWith(expect.objectContaining({
      resolvedInputs: expect.objectContaining({
        'json-in': [{ instanceAddress: '0x9999' }],
      }),
    }));
  });

  it('routes downstream execution only through selected nextControlPorts', async () => {
    vi.useFakeTimers();

    const trueSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));
    const falseSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    const branchNode: StudioNodeDefinition = {
      manifest: {
        type: 'branch',
        typeVersion: 1,
        family: 'control',
        displayName: 'Branch',
        description: 'Routes to one output only',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [
          { key: 'true-out', displayName: 'True', direction: 'output', channel: 'control', cardinality: 'multiple' },
          { key: 'false-out', displayName: 'False', direction: 'output', channel: 'control', cardinality: 'multiple' },
        ],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {}, nextControlPorts: ['true-out'] }),
      },
      CanvasComponent: () => null,
    };

    const trueNode: StudioNodeDefinition = {
      manifest: {
        type: 'true-node',
        typeVersion: 1,
        family: 'control',
        displayName: 'True Node',
        description: 'True branch sink',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: { validate: () => [], execute: trueSpy },
      CanvasComponent: () => null,
    };

    const falseNode: StudioNodeDefinition = {
      manifest: {
        type: 'false-node',
        typeVersion: 1,
        family: 'control',
        displayName: 'False Node',
        description: 'False branch sink',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: { validate: () => [], execute: falseSpy },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, branchNode, trueNode, falseNode]);

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'branch-1', type: 'branch', position: { x: 120, y: 0 }, data: {} },
        { id: 'true-1', type: 'true-node', position: { x: 240, y: 0 }, data: {} },
        { id: 'false-1', type: 'false-node', position: { x: 240, y: 80 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-branch', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'branch-1', targetPortId: 'flow-in' },
        { id: 'edge-branch-true', channel: 'control', sourceNodeId: 'branch-1', sourcePortId: 'true-out', targetNodeId: 'true-1', targetPortId: 'flow-in' },
        { id: 'edge-branch-false', channel: 'control', sourceNodeId: 'branch-1', sourcePortId: 'false-out', targetNodeId: 'false-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(trueSpy).toHaveBeenCalledTimes(1);
    expect(falseSpy).not.toHaveBeenCalled();
  });

  it('publishes progress snapshots for long-running nodes before completion', async () => {
    vi.useFakeTimers();

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    const waitNode: StudioNodeDefinition = {
      manifest: {
        type: 'wait-test',
        typeVersion: 1,
        family: 'control',
        displayName: 'Wait',
        description: 'Long-running test node',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: async ({ reportProgress }) => {
          reportProgress({ kind: 'countdown', displayText: '0.2s', totalMs: 200, remainingMs: 200 });
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              reportProgress({ kind: 'countdown', displayText: '0.1s', totalMs: 200, remainingMs: 100 });
              resolve();
            }, 200);
          });
          reportProgress(null);
          return { state: 'success' as const, outputs: {} };
        },
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, waitNode]);

    const seenSnapshots: Array<{ status: string; progressText?: string }> = [];
    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'wait-1', type: 'wait-test', position: { x: 120, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-wait', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'wait-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        seenSnapshots.push({ status: snapshot.status, progressText: snapshot.progress?.displayText });
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(seenSnapshots).toContainEqual({ status: 'running', progressText: '0.2s' });
    expect(seenSnapshots).toContainEqual({ status: 'running', progressText: '0.1s' });
    expect(seenSnapshots[seenSnapshots.length - 1]).toMatchObject({ status: 'success' });
  });

  it('cancels long-running nodes without continuing downstream execution', async () => {
    vi.useFakeTimers();

    const downstreamSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    const waitNode: StudioNodeDefinition = {
      manifest: {
        type: 'wait-test',
        typeVersion: 1,
        family: 'control',
        displayName: 'Wait',
        description: 'Long-running test node',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: ({ abortSignal }) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ state: 'success' as const, outputs: {} }), 500);
          abortSignal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('cancelled'));
          }, { once: true });
        }),
      },
      CanvasComponent: () => null,
    };

    const sinkNode: StudioNodeDefinition = {
      manifest: {
        type: 'sink',
        typeVersion: 1,
        family: 'control',
        displayName: 'Sink',
        description: 'Downstream sink',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: downstreamSpy,
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, waitNode, sinkNode]);

    const cleanup = executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'wait-1', type: 'wait-test', position: { x: 120, y: 0 }, data: {} },
        { id: 'sink-1', type: 'sink', position: { x: 240, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-wait', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'wait-1', targetPortId: 'flow-in' },
        { id: 'edge-wait-sink', channel: 'control', sourceNodeId: 'wait-1', sourcePortId: 'flow-out', targetNodeId: 'sink-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 25,
    });

    await vi.advanceTimersByTimeAsync(100);
    cleanup();
    await vi.runAllTimersAsync();

    expect(downstreamSpy).not.toHaveBeenCalled();
  });

  it('persists per-run node runtime state across loop re-entry and clears after completion', async () => {
    vi.useFakeTimers();

    const loopPayloads: unknown[] = [];
    const loopBodySpy = vi.fn(() => ({ state: 'success' as const, outputs: {}, nextControlPorts: ['flow-out'] }));
    const doneSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));

    const triggerNode: StudioNodeDefinition = {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Flow start',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    const loopBodyNode: StudioNodeDefinition = {
      manifest: {
        type: 'loop-body',
        typeVersion: 1,
        family: 'control',
        displayName: 'Loop Body',
        description: 'Loop body test node',
        category: 'Test',
        inputs: [
          { key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' },
          { key: 'iteration-in', displayName: 'Iteration In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id },
        ],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: ({ resolvedInputs }) => {
          loopPayloads.push(resolvedInputs['iteration-in']?.[0] ?? null);
          loopBodySpy();
          return { state: 'success' as const, outputs: {}, nextControlPorts: ['flow-out'] };
        },
      },
      CanvasComponent: () => null,
    };

    const doneNode: StudioNodeDefinition = {
      manifest: {
        type: 'done-sink',
        typeVersion: 1,
        family: 'control',
        displayName: 'Done Sink',
        description: 'Done sink',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => {
          doneSpy();
          return { state: 'success' as const, outputs: {} };
        },
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([triggerNode, ForLoopNodeDef, loopBodyNode, doneNode]);

    const loopSnapshots: NodeExecutionSnapshot[] = [];

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'for-loop-1', type: 'for-loop', position: { x: 120, y: 0 }, data: { countSource: createLiteralExpressionSource('3', 'number') } },
        { id: 'loop-body-1', type: 'loop-body', position: { x: 240, y: 0 }, data: {} },
        { id: 'done-1', type: 'done-sink', position: { x: 240, y: 120 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-loop', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'for-loop-1', targetPortId: 'flow-in' },
        { id: 'edge-loop-body', channel: 'control', sourceNodeId: 'for-loop-1', sourcePortId: 'loop-out', targetNodeId: 'loop-body-1', targetPortId: 'flow-in' },
        { id: 'edge-loop-iteration', channel: 'data', sourceNodeId: 'for-loop-1', sourcePortId: 'iteration-out', targetNodeId: 'loop-body-1', targetPortId: 'iteration-in' },
        { id: 'edge-body-loop', channel: 'control', sourceNodeId: 'loop-body-1', sourcePortId: 'flow-out', targetNodeId: 'for-loop-1', targetPortId: 'flow-in' },
        { id: 'edge-loop-done', channel: 'control', sourceNodeId: 'for-loop-1', sourcePortId: 'done-out', targetNodeId: 'done-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        if (snapshot.nodeId === 'for-loop-1') {
          loopSnapshots.push(snapshot);
        }
      },
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(loopBodySpy).toHaveBeenCalledTimes(3);
    expect(loopPayloads).toEqual([
      { index: 0, totalCount: 3, isFirstIteration: true, isLastIteration: false },
      { index: 1, totalCount: 3, isFirstIteration: false, isLastIteration: false },
      { index: 2, totalCount: 3, isFirstIteration: false, isLastIteration: true },
    ]);
    expect(doneSpy).toHaveBeenCalledTimes(1);
    expect(loopSnapshots.some((snapshot) => snapshot.nextRuntimeState?.currentIndex === 2)).toBe(true);
    expect(loopSnapshots[loopSnapshots.length - 1]?.nextRuntimeState).toEqual({});
  });
});
