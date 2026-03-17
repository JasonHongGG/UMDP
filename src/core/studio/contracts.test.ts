import { describe, expect, it } from 'vitest';
import {
  arePortTypesCompatible,
  CLASS_INFO_SCHEMA,
  createClassInfoEnvelope,
  createEnvelope,
  createFlowPort,
  createJsonPort,
  GENERIC_JSON_SCHEMA,
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
    const envelope = createClassInfoEnvelope(
      {
        imageId: 'img-a',
        classId: 'player',
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [
          { id: 'member:health', label: 'health' },
          { id: 'member:speed', label: 'speed' },
        ],
        statics: [{ id: 'static:Instance', label: 'Instance' }],
        functions: [{ id: 'function:Move', label: 'Move' }],
      },
      {
        members: ['member:health'],
        statics: ['static:Instance'],
        functions: [],
      },
    );

    expect(envelope.meta).toMatchObject({ bindingState: 'bound' });
    expect(envelope.payload?.info.members).toEqual({ 'member:health': null });
    expect(envelope.payload?.info.statics).toEqual({ 'static:Instance': null });
    expect(envelope.payload?.info.functions).toEqual([]);
  });
});