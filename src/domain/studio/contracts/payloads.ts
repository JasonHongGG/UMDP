import type { ExpressionSource } from './expression';
import type { RuntimeInvokeFailureKind } from '../../analysis/contracts';

export type WorkflowJsonValue =
  | null
  | string
  | number
  | boolean
  | WorkflowJsonValue[]
  | { [key: string]: WorkflowJsonValue };

export interface JsonSchemaReference {
  id: string;
  version: number;
  title?: string;
  description?: string;
}

export interface WorkflowJsonEnvelope<TPayload = WorkflowJsonValue> {
  kind: 'json';
  schema: JsonSchemaReference;
  payload: TPayload;
  meta?: Record<string, WorkflowJsonValue>;
}

export interface ParameterDefinitionValue {
  type: string;
  value: string;
  source?: ExpressionSource;
}

export type ParameterDefinitionPayload = Record<string, ParameterDefinitionValue>;

export interface ClassInfoBasicPayload {
  imageName: string;
  className: string;
  namespace: string;
  fullName: string;
}

export interface ClassInfoFieldPayload {
  name: string;
  typeName: string;
  offset: string | null;
  address: WorkflowJsonValue;
  value: WorkflowJsonValue;
  isStatic: boolean;
}

export interface ClassInfoFunctionParameterPayload {
  position: number;
  name: string;
  typeName: string;
}

export interface ClassInfoFunctionPayload {
  name: string;
  signature: string;
  returnType: string;
  parameters: ClassInfoFunctionParameterPayload[];
  isStatic: boolean;
  runtimeRef: {
    imageStableId: string;
    classStableId: string;
    methodStableId: string;
  };
}

export interface ClassInfoPayload {
  basic: ClassInfoBasicPayload;
  instanceAddress: WorkflowJsonValue;
  statics: ClassInfoFieldPayload[];
  members: ClassInfoFieldPayload[];
  functions: ClassInfoFunctionPayload[];
}

export type InstanceReferenceSourceKind = 'manual' | 'call-function-result' | 'runtime-object';

export interface InstanceReferencePayload {
  address: string | null;
  sourceKind: InstanceReferenceSourceKind;
  runtimeTypeHint: string | null;
  displayName: string | null;
}

export interface CallFunctionArgumentPayload {
  name: string;
  typeName: string;
  value: WorkflowJsonValue;
}

export interface CallFunctionResultValuePayload {
  kind: string;
  value: WorkflowJsonValue;
  objectAddress: string | null;
}

export interface CallFunctionResultPayload {
  method: ClassInfoFunctionPayload | null;
  instanceAddress: WorkflowJsonValue;
  arguments: CallFunctionArgumentPayload[];
  success: boolean;
  failureKind: RuntimeInvokeFailureKind | 'validation' | 'transport';
  error: string | null;
  exception: string | null;
  result: CallFunctionResultValuePayload | null;
}

export const WORKFLOW_SCHEMA_IDS = {
  genericJson: 'studio.json.generic',
  classInfo: 'studio.class.info',
  callFunctionResult: 'studio.call-function.result',
  instanceReference: 'studio.instance.reference',
  parameterDefinitions: 'studio.params.definition',
} as const;