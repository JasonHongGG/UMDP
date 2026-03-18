import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createEnvelope, createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from './contracts';
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
      typeId: 'guarded',
      displayName: 'Guarded',
      description: 'Guarded test node',
      icon: () => null,
      defaultInputs: [createFlowPort('flow-in', 'Flow In')],
      defaultOutputs: [createFlowPort('flow-out', 'Flow Out')],
      validateExecution: () => ({ valid: false, error: 'Guard rejected execution.' }),
      execute: executeSpy,
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
          data: {
            inputs: [createFlowPort('flow-in', 'Flow In')],
            outputs: [createFlowPort('flow-out', 'Flow Out')],
          },
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
      typeId: 'params',
      displayName: 'Parameters',
      description: 'Passive parameter provider',
      icon: () => null,
      defaultInputs: [],
      defaultOutputs: [createJsonPort('params-out', 'Params', GENERIC_JSON_SCHEMA)],
      execute: () => ({
        state: 'success',
        outputs: {
          'params-out': createEnvelope(GENERIC_JSON_SCHEMA, { instanceAddress: '0x1234' }),
        },
      }),
      CanvasComponent: () => null,
    };

    const consumerExecute = vi.fn(({ incoming }) => ({
      state: 'success' as const,
      outputs: {
        'json-out': createEnvelope(GENERIC_JSON_SCHEMA, { received: incoming['json-in']?.[0]?.payload ?? null }),
      },
    }));

    const consumerNode: StudioNodeDefinition = {
      typeId: 'consumer',
      displayName: 'Consumer',
      description: 'Consumes JSON input',
      icon: () => null,
      defaultInputs: [createFlowPort('flow-in', 'Flow In'), createJsonPort('json-in', 'Json In', GENERIC_JSON_SCHEMA)],
      defaultOutputs: [createJsonPort('json-out', 'Json Out', GENERIC_JSON_SCHEMA)],
      execute: consumerExecute,
      CanvasComponent: () => null,
    };

    const triggerNode: StudioNodeDefinition = {
      typeId: 'trigger',
      displayName: 'Trigger',
      description: 'Flow start',
      icon: () => null,
      defaultInputs: [],
      defaultOutputs: [createFlowPort('flow-out', 'Flow Out')],
      execute: () => ({ state: 'success', outputs: {} }),
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
          data: {
            inputs: [],
            outputs: [createFlowPort('flow-out', 'Flow Out')],
          },
        },
        {
          id: 'params-1',
          type: 'params',
          position: { x: 120, y: 0 },
          data: {
            inputs: [],
            outputs: [createJsonPort('params-out', 'Params', GENERIC_JSON_SCHEMA)],
          },
        },
        {
          id: 'consumer-1',
          type: 'consumer',
          position: { x: 240, y: 0 },
          data: {
            inputs: [createFlowPort('flow-in', 'Flow In'), createJsonPort('json-in', 'Json In', GENERIC_JSON_SCHEMA)],
            outputs: [createJsonPort('json-out', 'Json Out', GENERIC_JSON_SCHEMA)],
          },
        },
      ],
      edges: [
        {
          id: 'edge-flow',
          sourceNodeId: 'trigger-1',
          sourcePortId: 'flow-out',
          targetNodeId: 'consumer-1',
          targetPortId: 'flow-in',
        },
        {
          id: 'edge-json',
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
