import {
  ConnectionDirection,
  ClassInfoPayload,
  IPort,
  JsonSchemaReference,
  ParameterDefinitionPayload,
  WORKFLOW_SCHEMA_IDS,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
} from './types';
import type { ConnectionChannel } from '../../domain/studio/contracts';
import type { ClassBinding, ClassInfoCatalog, ClassInfoSelection } from '../../domain/studio/editor';
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

const KNOWN_JSON_SCHEMAS: Record<string, JsonSchemaReference> = {
  [GENERIC_JSON_SCHEMA.id]: GENERIC_JSON_SCHEMA,
  [INSTANCE_REFERENCE_SCHEMA.id]: INSTANCE_REFERENCE_SCHEMA,
  [PARAMETER_DEFINITIONS_SCHEMA.id]: PARAMETER_DEFINITIONS_SCHEMA,
  [CLASS_INFO_SCHEMA.id]: CLASS_INFO_SCHEMA,
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

export function createClassInfoEnvelope(
  binding: ClassBinding | null,
  catalog: ClassInfoCatalog,
  selected: ClassInfoSelection,
  instanceAddress: WorkflowJsonValue = null,
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
    instanceAddress,
    statics: Object.fromEntries(selectedStatics.map((item) => [item.id, null])),
    members: Object.fromEntries(selectedMembers.map((item) => [item.id, null])),
    functions: selectedFunctions.map((item) => ({ id: item.id, label: item.label })),
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