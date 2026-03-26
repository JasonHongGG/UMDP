import {
  CallFunctionResultPayload,
  ClassInfoFieldPayload,
  ClassInfoFunctionPayload,
  ClassInfoPayload,
  EditorResultPayload,
  InstanceReferencePayload,
  JsonSchemaReference,
  ParameterDefinitionPayload,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
  WORKFLOW_SCHEMA_IDS,
} from '@/domain/studio/contracts';
import type { ConnectionChannel } from '@/domain/studio/contracts';
import { ConnectionDirection, IPort } from './types';
import type { ClassBinding, ClassInfoCatalog, ClassInfoSelection } from '@/domain/studio/editor';
import { addHexOffset, formatHexAddress, isExplicitHexAddress } from '@/core/addressFormat';
import { coerceRuntimeFieldValue } from '@/core/runtimeValue';
import { classifySchemaTypeSemantic } from './expression/semantic';
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

export const EDITOR_RESULT_SCHEMA: JsonSchemaReference = {
  id: WORKFLOW_SCHEMA_IDS.editorResult,
  version: 1,
  title: 'Editor Result Envelope',
};

const KNOWN_JSON_SCHEMAS: Record<string, JsonSchemaReference> = {
  [GENERIC_JSON_SCHEMA.id]: GENERIC_JSON_SCHEMA,
  [INSTANCE_REFERENCE_SCHEMA.id]: INSTANCE_REFERENCE_SCHEMA,
  [PARAMETER_DEFINITIONS_SCHEMA.id]: PARAMETER_DEFINITIONS_SCHEMA,
  [CLASS_INFO_SCHEMA.id]: CLASS_INFO_SCHEMA,
  [CALL_FUNCTION_RESULT_SCHEMA.id]: CALL_FUNCTION_RESULT_SCHEMA,
  [EDITOR_RESULT_SCHEMA.id]: EDITOR_RESULT_SCHEMA,
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
  binding: ClassBinding,
  item: ClassInfoCatalog['members'][number] | ClassInfoCatalog['statics'][number],
  instanceAddress: WorkflowJsonValue,
  resolvedMemberValues?: Record<string, ResolvedMemberRuntimeValue>,
): ClassInfoFieldPayload {
  const resolvedAddress = item.isStatic
    ? item.address
    : resolvedMemberValues?.[item.id]?.address ?? (typeof instanceAddress === 'string' ? addHexOffset(instanceAddress, item.offset) : null);
  const rawValue = item.isStatic ? item.value : resolvedMemberValues?.[item.id]?.value ?? null;

  return {
    runtimeRef: {
      imageStableId: binding.imageStableId,
      classStableId: binding.classStableId,
      memberStableId: item.id,
    },
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
    statics: selectedStatics.map((item) => createFieldPayload(binding, item, instanceAddress, resolvedMemberValues)),
    members: selectedMembers.map((item) => createFieldPayload(binding, item, instanceAddress, resolvedMemberValues)),
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

export function createInstanceReferenceEnvelope(payload: InstanceReferencePayload): WorkflowJsonEnvelope<InstanceReferencePayload> {
  return createEnvelope(INSTANCE_REFERENCE_SCHEMA, {
    ...payload,
    address: typeof payload.address === 'string' ? formatHexAddress(payload.address) : null,
  }, {
    source: 'instance-reference',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isClassInfoPayload(value: unknown): value is ClassInfoPayload {
  return isRecord(value)
    && Array.isArray(value.functions)
    && Array.isArray(value.statics)
    && Array.isArray(value.members)
    && isRecord(value.basic);
}

function isParameterDefinitionPayload(value: unknown): value is ParameterDefinitionPayload {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    return typeof entry.type === 'string' && 'value' in entry;
  });
}

function isLikelyReferenceTypeName(typeName: string): boolean {
  const normalized = typeName.trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === 'system.object'
    || lower.endsWith('[]')
    || lower.includes('<')
    || lower.includes('>')
    || lower.includes('.')
  ) {
    return true;
  }

  if (lower.startsWith('system.nullable<')) {
    return false;
  }

  return /^[a-z_][\w`]*$/i.test(normalized);
}

function getProjectedFieldReferenceAddress(field: ClassInfoFieldPayload): string | null {
  if (typeof field.value !== 'string') {
    return null;
  }

  const normalized = formatHexAddress(field.value);
  return normalized && isExplicitHexAddress(normalized) ? normalized : null;
}

function canProjectFieldAsInstanceReference(field: ClassInfoFieldPayload): boolean {
  if (!getProjectedFieldReferenceAddress(field)) {
    return false;
  }

  const semantic = classifySchemaTypeSemantic(field.typeName);
  if (semantic.kind === 'address') {
    return true;
  }

  return isLikelyReferenceTypeName(field.typeName);
}

export function getInstanceReferencePayloadFromValue(value: unknown): InstanceReferencePayload | null {
  if (!isRecord(value) || !('address' in value) || !('sourceKind' in value)) {
    return null;
  }

  return {
    address: typeof value.address === 'string' ? formatHexAddress(value.address) : null,
    sourceKind: value.sourceKind as InstanceReferencePayload['sourceKind'],
    runtimeTypeHint: typeof value.runtimeTypeHint === 'string' ? value.runtimeTypeHint : null,
    displayName: typeof value.displayName === 'string' ? value.displayName : null,
  };
}

export function getProjectedInstanceReferencePayloadFromValue(value: unknown): InstanceReferencePayload | null {
  const directReference = getInstanceReferencePayloadFromValue(value);
  if (directReference) {
    return directReference;
  }

  if (isParameterDefinitionPayload(value)) {
    const addressParameters = Object.entries(value).filter(([, entry]) => entry.type === 'address');
    if (addressParameters.length !== 1) {
      return null;
    }

    const [parameterName, parameter] = addressParameters[0]!;
    const normalizedAddress = typeof parameter.value === 'string' ? formatHexAddress(parameter.value) : null;
    if (!normalizedAddress || !isExplicitHexAddress(normalizedAddress)) {
      return null;
    }

    return {
      address: normalizedAddress,
      sourceKind: 'manual',
      runtimeTypeHint: null,
      displayName: parameterName,
    };
  }

  if (!isClassInfoPayload(value)) {
    return null;
  }

  const projectedFields = [...value.members, ...value.statics].filter(canProjectFieldAsInstanceReference);
  if (projectedFields.length !== 1) {
    return null;
  }

  const field = projectedFields[0]!;
  const projectedAddress = getProjectedFieldReferenceAddress(field);
  if (!projectedAddress) {
    return null;
  }

  return {
    address: projectedAddress,
    sourceKind: 'runtime-object',
    runtimeTypeHint: field.typeName,
    displayName: `${value.basic.className}.${field.name}`,
  };
}

export function createCallFunctionResultEnvelope(payload: CallFunctionResultPayload): WorkflowJsonEnvelope<CallFunctionResultPayload> {
  return createEnvelope(CALL_FUNCTION_RESULT_SCHEMA, payload, {
    source: 'call-function-node',
  });
}

export function createEditorResultEnvelope(payload: EditorResultPayload): WorkflowJsonEnvelope<EditorResultPayload> {
  return createEnvelope(EDITOR_RESULT_SCHEMA, payload, {
    source: 'editor-node',
  });
}