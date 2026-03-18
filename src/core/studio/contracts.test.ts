import { describe, expect, it } from 'vitest';
import {
  arePortDataTypesCompatible,
  arePortsCompatible,
  arePortTypesCompatible,
  CLASS_INFO_SCHEMA,
  createClassInfoEnvelope,
  createEnvelope,
  createFlowPort,
  createJsonPort,
  GENERIC_JSON_SCHEMA,
  PARAMETER_DEFINITIONS_SCHEMA,
} from './contracts';

describe('studio contracts', () => {
  it('creates flow and json ports with the expected metadata', () => {
    expect(createFlowPort('flow-out', 'Flow Out')).toMatchObject({ id: 'flow-out', label: 'Flow Out', type: 'flow' });
    expect(createJsonPort('info-out', 'Info', GENERIC_JSON_SCHEMA)).toMatchObject({ id: 'info-out', label: 'Info', type: 'json', schema: GENERIC_JSON_SCHEMA });
  });

  it('only treats equal port types as compatible', () => {
    expect(arePortTypesCompatible('flow', 'flow')).toBe(true);
    expect(arePortTypesCompatible('json', 'json')).toBe(true);
    expect(arePortTypesCompatible('flow', 'json')).toBe(false);
  });

  it('matches json ports only when their declared schemas align', () => {
    const genericOutput = createJsonPort('json-out', 'Json Out', GENERIC_JSON_SCHEMA);
    const classInfoInput = createJsonPort('info-in', 'Info In', CLASS_INFO_SCHEMA, undefined, { direction: 'input' });
    const classInfoOutput = createJsonPort('info-out', 'Info Out', CLASS_INFO_SCHEMA);
    const paramsInput = createJsonPort('params-in', 'Params In', PARAMETER_DEFINITIONS_SCHEMA, undefined, { direction: 'input' });

    expect(arePortDataTypesCompatible(genericOutput, classInfoInput)).toBe(false);
    expect(arePortsCompatible(classInfoOutput, classInfoInput)).toBe(true);
    expect(arePortsCompatible(classInfoOutput, paramsInput)).toBe(false);
  });

  it('creates a generic workflow envelope with schema and meta', () => {
    const envelope = createEnvelope(GENERIC_JSON_SCHEMA, { ok: true }, { source: 'unit-test' });

    expect(envelope).toEqual({
      kind: 'json',
      schema: GENERIC_JSON_SCHEMA,
      payload: { ok: true },
      meta: { source: 'unit-test' },
    });
  });

  it('returns an unbound class info envelope when no binding exists', () => {
    const envelope = createClassInfoEnvelope(null, { members: [], statics: [], functions: [] }, { members: [], statics: [], functions: [] });

    expect(envelope.schema).toEqual(CLASS_INFO_SCHEMA);
    expect(envelope.payload).toBeNull();
    expect(envelope.meta).toMatchObject({ bindingState: 'unbound' });
  });

  it('emits only the selected class info entries in a bound class envelope', () => {
    const memberHealth = 'field:player:health' as any;
    const memberSpeed = 'field:player:speed' as any;
    const staticInstance = 'field:player:instance' as any;
    const functionMove = 'method:player:move' as any;

    const envelope = createClassInfoEnvelope(
      {
        imageStableId: 'image:img-a' as any,
        classStableId: 'class:player' as any,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [
          { id: memberHealth, label: 'health' },
          { id: memberSpeed, label: 'speed' },
        ],
        statics: [{ id: staticInstance, label: 'Instance' }],
        functions: [{ id: functionMove, label: 'Move' }],
      },
      {
        members: [memberHealth],
        statics: [staticInstance],
        functions: [],
      },
    );

    expect(envelope.meta).toMatchObject({ bindingState: 'bound' });
    expect(envelope.payload).toEqual({
      statics: { [staticInstance]: null },
      members: { [memberHealth]: null },
      functions: [],
    });
  });
});