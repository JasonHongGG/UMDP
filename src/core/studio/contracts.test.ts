import { describe, expect, it } from 'vitest';
import {
  createClassStableId,
  createFieldStableId,
  createImageStableId,
  createMethodStableId,
} from '../../domain/contracts/shared-identity';
import {
  arePortDataTypesCompatible,
  arePortsCompatible,
  arePortTypesCompatible,
  CLASS_INFO_SCHEMA,
  createClassInfoEnvelope,
  createEnvelope,
  createFlowPort,
  createInstanceReferenceEnvelope,
  createJsonPort,
  GENERIC_JSON_SCHEMA,
  getInstanceReferencePayloadFromValue,
  getProjectedInstanceReferencePayloadFromValue,
  INSTANCE_REFERENCE_SCHEMA,
  PARAMETER_DEFINITIONS_SCHEMA,
} from './contracts';

const IMAGE_A = createImageStableId({ imageName: 'Assembly-CSharp.dll', imagePath: 'Assembly-CSharp.dll' });
const CLASS_PLAYER = createClassStableId({ imageStableId: IMAGE_A, namespace: 'Gameplay', className: 'PlayerController' });
const MEMBER_HEALTH = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'health', fieldType: 'System.Int32', fieldKind: 'instance' });
const MEMBER_SPEED = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'speed', fieldType: 'System.Single', fieldKind: 'instance' });
const STATIC_INSTANCE = createFieldStableId({ classStableId: CLASS_PLAYER, fieldName: 'Instance', fieldType: 'Gameplay.PlayerController', fieldKind: 'static' });
const METHOD_MOVE = createMethodStableId({ classStableId: CLASS_PLAYER, methodName: 'Move', signature: 'System.Void ()' });

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

    expect(arePortDataTypesCompatible(genericOutput, classInfoInput)).toBe(true);
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

  it('creates and parses canonical instance reference envelopes', () => {
    const envelope = createInstanceReferenceEnvelope({
      address: '244190ab960',
      sourceKind: 'call-function-result',
      runtimeTypeHint: 'WorldData',
      displayName: 'getWorldData result',
    });

    expect(envelope.schema).toEqual(INSTANCE_REFERENCE_SCHEMA);
    expect(getInstanceReferencePayloadFromValue(envelope.payload)).toEqual({
      address: '0x244190AB960',
      sourceKind: 'call-function-result',
      runtimeTypeHint: 'WorldData',
      displayName: 'getWorldData result',
    });
  });

  it('projects a single reference-like class info field into an instance reference payload', () => {
    const envelope = createClassInfoEnvelope(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [],
        statics: [{ id: STATIC_INSTANCE, label: 'Instance', name: 'Instance', typeName: 'Gameplay.PlayerController', offset: null, address: '0x2000', value: '244190ab960', isStatic: true }],
        functions: [],
      },
      {
        members: [],
        statics: [STATIC_INSTANCE],
        functions: [],
      },
    );

    expect(getProjectedInstanceReferencePayloadFromValue(envelope.payload)).toEqual({
      address: '0x244190AB960',
      sourceKind: 'runtime-object',
      runtimeTypeHint: 'Gameplay.PlayerController',
      displayName: 'PlayerController.Instance',
    });
  });

  it('projects a single address parameter definition into an instance reference payload', () => {
    expect(getProjectedInstanceReferencePayloadFromValue({
      playerAddress: {
        type: 'address',
        value: '244190ab960',
      },
    })).toEqual({
      address: '0x244190AB960',
      sourceKind: 'manual',
      runtimeTypeHint: null,
      displayName: 'playerAddress',
    });
  });

  it('does not project ambiguous class info fields into an instance reference payload', () => {
    const envelope = createClassInfoEnvelope(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [
          { id: MEMBER_HEALTH, label: 'health', name: 'health', typeName: 'Gameplay.HealthData', offset: '0x10', address: '0x1010', value: '0x2000', isStatic: false },
          { id: MEMBER_SPEED, label: 'speed', name: 'speed', typeName: 'Gameplay.SpeedData', offset: '0x14', address: '0x1014', value: '0x3000', isStatic: false },
        ],
        statics: [],
        functions: [],
      },
      {
        members: [MEMBER_HEALTH, MEMBER_SPEED],
        statics: [],
        functions: [],
      },
      '0x1234',
    );

    expect(getProjectedInstanceReferencePayloadFromValue(envelope.payload)).toBeNull();
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
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [
          { id: MEMBER_HEALTH, label: 'health', name: 'health', typeName: 'System.Int32', offset: '0x10', address: null, value: null, isStatic: false },
          { id: MEMBER_SPEED, label: 'speed', name: 'speed', typeName: 'System.Single', offset: '0x14', address: null, value: null, isStatic: false },
        ],
        statics: [{ id: STATIC_INSTANCE, label: 'Instance', name: 'Instance', typeName: 'Gameplay.PlayerController', offset: null, address: '0x2000', value: '0x1234', isStatic: true }],
        functions: [{ id: METHOD_MOVE, label: 'Move', name: 'Move', signature: 'System.Void ()', returnType: 'System.Void', parameters: [], isStatic: false, tags: [] }],
      },
      {
        members: [MEMBER_HEALTH],
        statics: [STATIC_INSTANCE],
        functions: [],
      },
    );

    expect(envelope.meta).toMatchObject({ bindingState: 'bound' });
    expect(envelope.payload).toEqual({
      basic: {
        imageName: 'Assembly-CSharp.dll',
        className: 'PlayerController',
        namespace: 'Gameplay',
        fullName: 'Gameplay.PlayerController',
      },
      instanceAddress: null,
      statics: [{
        runtimeRef: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          memberStableId: STATIC_INSTANCE,
        },
        name: 'Instance',
        typeName: 'Gameplay.PlayerController',
        offset: null,
        address: '0x2000',
        value: '0x1234',
        isStatic: true,
      }],
      members: [{
        runtimeRef: {
          imageStableId: IMAGE_A,
          classStableId: CLASS_PLAYER,
          memberStableId: MEMBER_HEALTH,
        },
        name: 'health',
        typeName: 'System.Int32',
        offset: '0x10',
        address: null,
        value: null,
        isStatic: false,
      }],
      functions: [],
    });
  });

  it('emits the resolved instance address value when provided', () => {
    const envelope = createClassInfoEnvelope(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      { members: [], statics: [], functions: [] },
      { members: [], statics: [], functions: [] },
      '0x12345678',
    );

    expect(envelope.payload).toEqual({
      basic: {
        imageName: 'Assembly-CSharp.dll',
        className: 'PlayerController',
        namespace: 'Gameplay',
        fullName: 'Gameplay.PlayerController',
      },
      instanceAddress: '0x12345678',
      statics: [],
      members: [],
      functions: [],
    });
  });

  it('coerces resolved runtime member values using the field type', () => {
    const envelope = createClassInfoEnvelope(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [
          { id: MEMBER_HEALTH, label: 'health', name: 'health', typeName: 'System.Int32', offset: '0x10', address: null, value: null, isStatic: false },
          { id: MEMBER_SPEED, label: 'speed', name: 'speed', typeName: 'System.Single', offset: '0x14', address: null, value: null, isStatic: false },
        ],
        statics: [],
        functions: [],
      },
      {
        members: [MEMBER_HEALTH, MEMBER_SPEED],
        statics: [],
        functions: [],
      },
      '0x12345678',
      {
        [MEMBER_HEALTH]: { address: '0x12345688', value: '150' },
        [MEMBER_SPEED]: { address: '0x1234568C', value: '2.5' },
      },
    );

    expect(envelope.payload).toMatchObject({
      members: [
        {
          name: 'health',
          address: '0x12345688',
          value: 150,
        },
        {
          name: 'speed',
          address: '0x1234568C',
          value: 2.5,
        },
      ],
    });
  });

  it('tolerates malformed persisted functions without parameter arrays', () => {
    const envelope = createClassInfoEnvelope(
      {
        imageStableId: IMAGE_A,
        classStableId: CLASS_PLAYER,
        fullName: 'Gameplay.PlayerController',
        name: 'PlayerController',
        namespace: 'Gameplay',
        imageName: 'Assembly-CSharp.dll',
      },
      {
        members: [],
        statics: [],
        functions: [{
          id: METHOD_MOVE,
          label: 'Move',
          name: 'Move',
          signature: 'System.Void ()',
          returnType: 'System.Void',
          isStatic: false,
          tags: [],
        } as unknown as never],
      },
      {
        members: [],
        statics: [],
        functions: [METHOD_MOVE],
      },
    );

    expect(envelope.payload).toMatchObject({
      functions: [{
        name: 'Move',
        parameters: [],
      }],
    });
  });
});