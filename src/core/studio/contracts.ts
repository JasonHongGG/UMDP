import {
  CallFunctionResultPayload,
  ClassInfoFieldPayload,
  ClassInfoFunctionPayload,
  ClassInfoPayload,
  JsonSchemaReference,
  ParameterDefinitionPayload,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
  WORKFLOW_SCHEMA_IDS,
} from '../../domain/studio/contracts';
import type { ConnectionChannel } from '../../domain/studio/contracts';
import { ConnectionDirection, IPort } from './types';
import type { ClassBinding, ClassInfoCatalog, ClassInfoSelection } from '../../domain/studio/editor';
import { addHexOffset, formatHexAddress } from '../addressFormat';
import { coerceRuntimeFieldValue } from '../runtimeValue';
export { arePortDataTypesCompatible, arePortTypesCompatible, arePortsCompatible } from './connectionPolicy';

export const WORKFLOW_DOCUMENT_VERSION = 1;

export const GENERIC_JSON_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.genericJson,
  version: 1,
  title: 'Generic JSON Envelope',
};

export const INSTANCE_REFERENCE_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.instanceReference,
  version: 1,
  title: 'Instance Reference',
};

export const PARAMETER_DEFINITIONS_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.parameterDefinitions,
  version: 1,
  title: 'Parameter Definitions',
};

export const CLASS_INFO_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.classInfo,
  version: 1,
  title: 'Class Info Envelope',
};

export const CALL_FUNCTION_RESULT_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.callFunctionResult,
  version: 1,
  title: 'Call Function Result Envelope',
};

const KNOWN_JSON_SCHEMAS: Record<string, JsonSchemaReference> = {
  [GENERIC_JSON_SCHEMA.id]: GENERIC_JSON_SCHEMA,
  [INSTANCE_REFERENCE_SCHEMA.id]: INSTANCE_REFERENCE_SCHEMA,
  [PARAMETER_DEFINITIONS_SCHEMA.id]: PARAMETER_DEFINITIONS_SCHEMA,
  [CLASS_INFO_SCHEMA.id]: CLASS_INFO_SCHEMA,
  [CALL_FUNCTION_RESULT_SCHEMA.id]: CALL_FUNCTION_RESULT_SCHEMA,
};

export function resolveJsonSchemaReference(dataType?: string): JsonSchemaReference {
  if (!dataType) {
    return GENERIC_JSON_SCHEMA;
  }

  return KNOWN_JSON_SCHEMAS[dataType] ?? {
    id: dataType,
    version: 1,
  };
}

interface CreatePortOptions {
  direction?: ConnectionDirection;
  cardinality?: 'single' | 'multiple';
  required?: boolean;
  channel?: ConnectionChannel;
}

export function createJsonPort(id: string, label: string, schema: JsonSchemaReference, description?: string, options?: CreatePortOptions): IPort {
  return {
    id,
    label,
    type: 'json',
    direction: options?.direction ?? 'output',
    channel: options?.channel ?? 'data',
    cardinality: options?.cardinality ?? 'single',
    required: options?.required,
    dataType: schema.id,
    schema,
    description,
  };
}

export function createFlowPort(id: string, label: string, description?: string, options?: CreatePortOptions): IPort {
  return {
    id,
    label,
    type: 'flow',
    direction: options?.direction ?? 'output',
    channel: options?.channel ?? 'control',
    cardinality: options?.cardinality ?? 'single',
    required: options?.required,
    description,
  };
}

export function createEnvelope<TPayload>(schema: JsonSchemaReference, payload: TPayload, meta?: Record<string, unknown>): WorkflowJsonEnvelope<TPayload> {
  return {
    kind: 'json',
    schema,
    payload,
    meta: meta as Record<string, never> | undefined,
  };
}

export interface ResolvedMemberRuntimeValue {
  address: string | null;
  value: string | null;
}

function createFieldPayload(
  item: ClassInfoCatalog['members'][number] | ClassInfoCatalog['statics'][number],
  instanceAddress: WorkflowJsonValue,
  resolvedMemberValues?: Record<string, ResolvedMemberRuntimeValue>,
): ClassInfoFieldPayload {
  const resolvedAddress = item.isStatic
    ? item.address
    : resolvedMemberValues?.[item.id]?.address ?? (typeof instanceAddress === 'string' ? addHexOffset(instanceAddress, item.offset) : null);
  const rawValue = item.isStatic ? item.value : resolvedMemberValues?.[item.id]?.value ?? null;

  return {
    name: item.name,
    typeName: item.typeName,
    offset: item.offset,
    address: formatHexAddress(resolvedAddress),
    value: coerceRuntimeFieldValue(item.typeName, rawValue),
    isStatic: item.isStatic,
  };
}

function createFunctionPayload(binding: ClassBinding, item: ClassInfoCatalog['functions'][number]): ClassInfoFunctionPayload {
  const parameters = Array.isArray(item.parameters) ? item.parameters : [];

  return {
    name: item.name,
    signature: item.signature,
    returnType: item.returnType,
    parameters: parameters.map((parameter) => ({
      position: parameter.position,
      name: parameter.name,
      typeName: parameter.typeName,
    })),
    isStatic: item.isStatic,
    runtimeRef: {
      imageStableId: binding.imageStableId,
      classStableId: binding.classStableId,
      methodStableId: item.id,
    },
  };
}

export function createClassInfoEnvelope(
  binding: ClassBinding | null,
  catalog: ClassInfoCatalog,
  selected: ClassInfoSelection,
  instanceAddress: WorkflowJsonValue = null,
  resolvedMemberValues?: Record<string, ResolvedMemberRuntimeValue>,
): WorkflowJsonEnvelope<ClassInfoPayload | null> {
  if (!binding) {
    return createEnvelope(CLASS_INFO_SCHEMA, null, {
      source: 'class-node',
      bindingState: 'unbound',
    });
  }

  const selectedMembers = catalog.members.filter((item) => selected.members.includes(item.id));
  const selectedStatics = catalog.statics.filter((item) => selected.statics.includes(item.id));
  const selectedFunctions = catalog.functions.filter((item) => selected.functions.includes(item.id));

  return createEnvelope(CLASS_INFO_SCHEMA, {
    basic: {
      imageName: binding.imageName,
      className: binding.name,
      namespace: binding.namespace,
      fullName: binding.fullName,
    },
    instanceAddress,
    statics: selectedStatics.map((item) => createFieldPayload(item, instanceAddress, resolvedMemberValues)),
    members: selectedMembers.map((item) => createFieldPayload(item, instanceAddress, resolvedMemberValues)),
    functions: selectedFunctions.map((item) => createFunctionPayload(binding, item)),
  }, {
    source: 'class-node',
    bindingState: 'bound',
  });
}

export function createParameterDefinitionsEnvelope(parameters: ParameterDefinitionPayload): WorkflowJsonEnvelope<ParameterDefinitionPayload> {
  return createEnvelope(PARAMETER_DEFINITIONS_SCHEMA, parameters, {
    source: 'parameters-node',
  });
}

export function createCallFunctionResultEnvelope(payload: CallFunctionResultPayload): WorkflowJsonEnvelope<CallFunctionResultPayload> {
  return createEnvelope(CALL_FUNCTION_RESULT_SCHEMA, payload, {
    source: 'call-function-node',
  });
}