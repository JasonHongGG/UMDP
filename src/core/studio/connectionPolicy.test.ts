import { afterEach, describe, expect, it } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { validateConnection } from './connectionPolicy';
import { GENERIC_JSON_SCHEMA, PARAMETER_DEFINITIONS_SCHEMA } from './contracts';

function registerConnectionTestNodes() {
  initializeStudioNodeRegistry([
    {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Test trigger node',
        category: 'Test',
        inputs: [],
        outputs: [
          { key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' },
          { key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id },
        ],
        parameters: [],
      },
      icon: () => null,
      CanvasComponent: () => null,
    },
    {
      manifest: {
        type: 'class-ref',
        typeVersion: 1,
        family: 'runtime',
        displayName: 'Class Ref',
        description: 'Test class node',
        category: 'Test',
        inputs: [
          { key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' },
          { key: 'instance-in', displayName: 'Instance In', direction: 'input', channel: 'data', cardinality: 'single', dataType: PARAMETER_DEFINITIONS_SCHEMA.id },
        ],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      CanvasComponent: () => null,
    },
  ]);
}

afterEach(() => {
  initializeStudioNodeRegistry([]);
});

const nodes = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {},
  },
  {
    id: 'class-1',
    type: 'class-ref',
    position: { x: 120, y: 0 },
    data: {},
  },
];

describe('connectionPolicy', () => {
  it('rejects connections that do not start from an output handle', () => {
    registerConnectionTestNodes();

    const result = validateConnection({
      nodeId: 'class-1',
      portId: 'flow-in',
      portType: 'flow',
      handleType: 'target',
    }, {
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, nodes, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Connections must start from an output port.');
  });

  it('rejects incompatible handle directions and port types', () => {
    registerConnectionTestNodes();

    const wrongDirection = validateConnection({
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, nodes, []);

    expect(wrongDirection.valid).toBe(false);
    expect(wrongDirection.reason).toBe('Port types are incompatible.');
  });

  it('rejects incompatible data schemas even when both ports are json', () => {
    registerConnectionTestNodes();

    const wrongSchema = validateConnection({
      nodeId: 'trigger-1',
      portId: 'json-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, nodes, []);

    expect(wrongSchema.valid).toBe(false);
    expect(wrongSchema.reason).toBe('Port schemas or connection semantics are incompatible.');
  });

  it('marks the previous inbound edge for replacement when reconnecting the same target port', () => {
    registerConnectionTestNodes();

    const result = validateConnection({
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'flow-in',
      portType: 'flow',
      handleType: 'target',
    }, nodes, [{
      id: 'edge-1',
      channel: 'control',
      sourceNodeId: 'other-1',
      sourcePortId: 'flow-out',
      targetNodeId: 'class-1',
      targetPortId: 'flow-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: ['edge-1'],
    });
  });

  it('does not replace inbound edges when the target port allows multiple connections', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'source-a',
          typeVersion: 1,
          family: 'data',
          displayName: 'Source A',
          description: 'Test source A',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'multiple', dataType: GENERIC_JSON_SCHEMA.id }],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
      {
        manifest: {
          type: 'target-many',
          typeVersion: 1,
          family: 'data',
          displayName: 'Target Many',
          description: 'Test target',
          category: 'Test',
          inputs: [{ key: 'json-in', displayName: 'Json In', direction: 'input', channel: 'data', cardinality: 'multiple', dataType: GENERIC_JSON_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'source-a-1',
      portId: 'json-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'target-many-1',
      portId: 'json-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'source-a-1', type: 'source-a', position: { x: 0, y: 0 }, data: {} },
      { id: 'target-many-1', type: 'target-many', position: { x: 120, y: 0 }, data: {} },
    ], [{
      id: 'edge-existing',
      channel: 'data',
      sourceNodeId: 'source-b-1',
      sourcePortId: 'json-out',
      targetNodeId: 'target-many-1',
      targetPortId: 'json-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });
});