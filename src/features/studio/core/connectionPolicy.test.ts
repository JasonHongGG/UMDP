import { afterEach, describe, expect, it } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { validateConnection } from './connectionPolicy';
import { CALL_FUNCTION_RESULT_SCHEMA, CLASS_INFO_SCHEMA, GENERIC_JSON_SCHEMA, INSTANCE_REFERENCE_SCHEMA } from './contracts';
import ForLoopNodeDef from '@/features/studio/nodes/ForLoopNode/ForLoopNode';

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
          { key: 'instance-in', displayName: 'Instance In', direction: 'input', channel: 'data', cardinality: 'single', dataType: INSTANCE_REFERENCE_SCHEMA.id },
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

  it('rejects incompatible specific data schemas even when both ports are json', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'result-source',
          typeVersion: 1,
          family: 'runtime',
          displayName: 'Result Source',
          description: 'Produces a call result envelope',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'result-out', displayName: 'Result', direction: 'output', channel: 'data', cardinality: 'single', dataType: CALL_FUNCTION_RESULT_SCHEMA.id }],
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
          description: 'Expects an instance reference',
          category: 'Test',
          inputs: [{ key: 'instance-in', displayName: 'Instance In', direction: 'input', channel: 'data', cardinality: 'single', dataType: INSTANCE_REFERENCE_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const wrongSchema = validateConnection({
      nodeId: 'result-source-1',
      portId: 'result-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'result-source-1', type: 'result-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'class-1', type: 'class-ref', position: { x: 120, y: 0 }, data: {} },
    ], []);

    expect(wrongSchema.valid).toBe(false);
    expect(wrongSchema.reason).toBe('Port schemas or connection semantics are incompatible.');
  });

  it('allows class info outputs to connect into class instance inputs for member reference projection', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'class-source',
          typeVersion: 1,
          family: 'runtime',
          displayName: 'Class Source',
          description: 'Produces a class info envelope',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'info-out', displayName: 'Info', direction: 'output', channel: 'data', cardinality: 'single', dataType: CLASS_INFO_SCHEMA.id }],
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
          description: 'Expects an instance reference',
          category: 'Test',
          inputs: [{ key: 'instance-in', displayName: 'Instance In', direction: 'input', channel: 'data', cardinality: 'single', dataType: INSTANCE_REFERENCE_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'class-source-1',
      portId: 'info-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'class-source-1', type: 'class-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'class-1', type: 'class-ref', position: { x: 120, y: 0 }, data: {} },
    ], []);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });

  it('allows parameter definition outputs to connect into class instance inputs for manual address projection', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'params-source',
          typeVersion: 1,
          family: 'data',
          displayName: 'Params Source',
          description: 'Produces parameter definitions',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'params-out', displayName: 'Params', direction: 'output', channel: 'data', cardinality: 'single', dataType: 'studio.params.definition' }],
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
          description: 'Expects an instance reference',
          category: 'Test',
          inputs: [{ key: 'instance-in', displayName: 'Instance In', direction: 'input', channel: 'data', cardinality: 'single', dataType: INSTANCE_REFERENCE_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'params-source-1',
      portId: 'params-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'params-source-1', type: 'params-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'class-1', type: 'class-ref', position: { x: 120, y: 0 }, data: {} },
    ], []);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
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

  it('keeps the initial trigger edge when a loop body reconnects into for-loop flow-in', () => {
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
          outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
      ForLoopNodeDef,
      {
        manifest: {
          type: 'loop-body',
          typeVersion: 1,
          family: 'control',
          displayName: 'Loop Body',
          description: 'Loop body test node',
          category: 'Test',
          inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
          outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'loop-body-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, {
      nodeId: 'for-loop-1',
      portId: 'flow-in',
      portType: 'flow',
      handleType: 'target',
    }, [
      { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      { id: 'for-loop-1', type: 'for-loop', position: { x: 120, y: 0 }, data: {} },
      { id: 'loop-body-1', type: 'loop-body', position: { x: 240, y: 0 }, data: {} },
    ], [{
      id: 'edge-trigger-loop',
      channel: 'control',
      sourceNodeId: 'trigger-1',
      sourcePortId: 'flow-out',
      targetNodeId: 'for-loop-1',
      targetPortId: 'flow-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });

  it('does not replace outbound edges when the source flow port allows multiple connections', () => {
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
      id: 'edge-existing',
      channel: 'control',
      sourceNodeId: 'trigger-1',
      sourcePortId: 'flow-out',
      targetNodeId: 'other-class-1',
      targetPortId: 'flow-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });

  it('does not replace outbound edges when the source data port allows multiple connections', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'source-many',
          typeVersion: 1,
          family: 'data',
          displayName: 'Source Many',
          description: 'Test source',
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
          type: 'target-single',
          typeVersion: 1,
          family: 'data',
          displayName: 'Target Single',
          description: 'Test target',
          category: 'Test',
          inputs: [{ key: 'json-in', displayName: 'Json In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'source-many-1',
      portId: 'json-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'target-single-2',
      portId: 'json-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'source-many-1', type: 'source-many', position: { x: 0, y: 0 }, data: {} },
      { id: 'target-single-1', type: 'target-single', position: { x: 120, y: 0 }, data: {} },
      { id: 'target-single-2', type: 'target-single', position: { x: 240, y: 0 }, data: {} },
    ], [{
      id: 'edge-existing',
      channel: 'data',
      sourceNodeId: 'source-many-1',
      sourcePortId: 'json-out',
      targetNodeId: 'target-single-1',
      targetPortId: 'json-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });

  it('allows specific schema outputs to connect into generic json display inputs', () => {
    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'result-source',
          typeVersion: 1,
          family: 'runtime',
          displayName: 'Result Source',
          description: 'Produces a specific call result schema',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'result-out', displayName: 'Result', direction: 'output', channel: 'data', cardinality: 'single', dataType: CALL_FUNCTION_RESULT_SCHEMA.id }],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
      {
        manifest: {
          type: 'display',
          typeVersion: 1,
          family: 'runtime',
          displayName: 'Display',
          description: 'Generic display input',
          category: 'Test',
          inputs: [{ key: 'payload-in', displayName: 'Payload In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        CanvasComponent: () => null,
      },
    ]);

    const result = validateConnection({
      nodeId: 'result-source-1',
      portId: 'result-out',
      portType: 'json',
      handleType: 'source',
    }, {
      nodeId: 'display-1',
      portId: 'payload-in',
      portType: 'json',
      handleType: 'target',
    }, [
      { id: 'result-source-1', type: 'result-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'display-1', type: 'display', position: { x: 120, y: 0 }, data: {} },
    ], []);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: [],
    });
  });
});