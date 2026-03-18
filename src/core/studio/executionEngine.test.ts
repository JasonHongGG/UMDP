import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createEnvelope, GENERIC_JSON_SCHEMA } from './contracts';
import { executeStudioFlow } from './executionEngine';
import { StudioNodeDefinition } from './types';

describe('executeStudioFlow', () => {
  afterEach(() => {
    vi.useRealTimers();
    initializeStudioNodeRegistry([]);
  });

  it('uses definition-level validation instead of hardcoded node types', () => {
    vi.useFakeTimers();

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

    const snapshots: Array<{ state: string; error?: string }> = [];
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
        snapshots.push({ state: snapshot.state, error: snapshot.error });
      },
      stepDelayMs: 25,
    });

    vi.runAllTimers();

    expect(executeSpy).not.toHaveBeenCalled();
    expect(snapshots).toContainEqual({ state: 'error', error: 'Guard rejected execution.' });
  });

  it('materializes passive json provider nodes for downstream inputs without flow edges', () => {
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

    vi.runAllTimers();

    expect(consumerExecute).toHaveBeenCalled();
    expect(seenSnapshots['params-1']).toEqual({
      'params-out': createEnvelope(GENERIC_JSON_SCHEMA, { instanceAddress: '0x1234' }),
    });
  });
});
