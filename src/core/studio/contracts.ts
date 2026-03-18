import {
  ClassBinding,
  ClassInfoCatalog,
  ClassInfoPayload,
  ClassInfoSelection,
  IPort,
  JsonSchemaReference,
  PortType,
  WORKFLOW_SCHEMA_IDS,
  WorkflowJsonEnvelope,
} from './types';
export { arePortTypesCompatible } from './connectionPolicy';

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

export const CLASS_INFO_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.classInfo,
  version: 1,
  title: 'Class Info Envelope',
};

export function createJsonPort(id: string, label: string, schema: JsonSchemaReference, description?: string): IPort {
  return {
    id,
    label,
    type: 'json',
    schema,
    description,
  };
}

export function createFlowPort(id: string, label: string, description?: string): IPort {
  return {
    id,
    label,
    type: 'flow',
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
    binding,
    selected,
    info: {
      statics: Object.fromEntries(selectedStatics.map((item) => [item.id, null])),
      members: Object.fromEntries(selectedMembers.map((item) => [item.id, null])),
      functions: selectedFunctions.map((item) => ({ id: item.id, label: item.label })),
    },
  }, {
    source: 'class-node',
    bindingState: 'bound',
  });
}