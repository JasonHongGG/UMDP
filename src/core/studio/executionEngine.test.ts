import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createFlowPort } from './contracts';
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
});
