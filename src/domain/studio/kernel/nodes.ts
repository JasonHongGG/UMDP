import type {
  ClassDescriptor,
  ImageDescriptor,
  RuntimeClassOverlayDescriptor,
  RuntimeFieldSetRequest,
  RuntimeFieldSetResult,
  RuntimeInstanceFieldSnapshot,
  RuntimeMethodInvokeRequest,
  RuntimeMethodInvokeResult,
} from '../../analysis/contracts';
import type { RuntimeInstanceFieldsRequest } from './boundary';
import type { ExpressionProgram, ExpressionSource } from './expression';

export type NodeCapabilityKey =
  | 'previewable'
  | 'runtime-executable'
  | 'data-emitter'
  | 'control-router'
  | 'editable'
  | 'inspectable';

export interface NodePortSchema {
  key: string;
  displayName: string;
  direction: 'input' | 'output';
  channel: 'control' | 'data';
  cardinality: 'single' | 'multiple';
  required?: boolean;
  dataType?: string;
}

export interface NodeStateFieldSchema {
  key: string;
  required: boolean;
  description?: string;
}

export interface NodeStateSchema {
  version: number;
  fields: NodeStateFieldSchema[];
}

export interface NodeCapabilityConfig {
  key: NodeCapabilityKey;
  description?: string;
}

export interface NodeSchema {
  id: string;
  version: number;
  family: 'control' | 'runtime' | 'data';
  displayName: string;
  description: string;
  ports: NodePortSchema[];
  stateSchema: NodeStateSchema;
  capabilityConfigs: NodeCapabilityConfig[];
}

export interface PreparedNodeInput {
  portKey: string;
  values: unknown[];
  expressions: ExpressionProgram[];
  provenanceNodeIds: string[];
}

export interface NodeExecutionServices {
  readonly abortRequested: boolean;
  evaluateExpression(source: ExpressionSource, bindings: Record<string, unknown>): {
    program: ExpressionProgram;
    value: unknown;
    actualKind: string;
  };
  getClassDescriptor(classStableId: string): ClassDescriptor | null;
  getImageDescriptor(imageStableId: string): ImageDescriptor | null;
  getRuntimeOverlay(classStableId: string): RuntimeClassOverlayDescriptor | null;
  loadRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest): Promise<RuntimeInstanceFieldSnapshot | null>;
  invokeRuntimeMethod(request: RuntimeMethodInvokeRequest): Promise<RuntimeMethodInvokeResult>;
  setRuntimeFieldValue(request: RuntimeFieldSetRequest): Promise<RuntimeFieldSetResult>;
}

export interface NodeExecutionOutput {
  portKey: string;
  value: unknown;
}

export interface NodeRoutingDecision {
  controlPortKeys: string[];
}

export interface NodeBehaviorResult {
  state: 'success' | 'error';
  outputs: NodeExecutionOutput[];
  routing: NodeRoutingDecision;
  nextState?: Record<string, unknown>;
  diagnostics?: Array<{
    severity: 'error' | 'warning';
    code: string;
    message: string;
  }>;
}

export interface NodeValidationResult {
  ok: boolean;
  diagnostics: Array<{
    severity: 'error' | 'warning';
    code: string;
    message: string;
  }>;
}

export interface NodeBehavior {
  validate?(state: Record<string, unknown>, inputs: PreparedNodeInput[]): NodeValidationResult;
  execute?(state: Record<string, unknown>, inputs: PreparedNodeInput[], services: NodeExecutionServices): Promise<NodeBehaviorResult> | NodeBehaviorResult;
}

export interface NodeDefinition {
  schema: NodeSchema;
  behavior: NodeBehavior;
}

export function hasNodeCapability(schema: NodeSchema, key: NodeCapabilityKey) {
  return schema.capabilityConfigs.some((capability) => capability.key === key);
}