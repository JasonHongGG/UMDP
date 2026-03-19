import type {
  ConnectionChannel,
  ExpressionReferenceDragPayload,
  ExpressionSource,
  NodeExecutionContract,
  NodeManifest,
  ValidationIssue,
} from '../../domain/studio/contracts';

export type PortType = 'flow' | 'json';
export type ConnectionDirection = 'input' | 'output';

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

export type NodeExecutionOutputMap = Record<string, WorkflowJsonEnvelope<any>>;
export type NodeExecutionInputMap = Record<string, WorkflowJsonEnvelope[]>;

export interface IPort {
  id: string;
  label: string;
  type: PortType;
  direction: ConnectionDirection;
  channel: ConnectionChannel;
  cardinality: 'single' | 'multiple';
  dataType?: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchemaReference;
}

export interface ConnectPortsOptions {
  replaceEdgeIds?: string[];
}

export interface BaseNodeData extends Record<string, unknown> {
  nodeName?: string;
}

export interface NodeTransform {
  x: number;
  y: number;
}

export interface StudioNode<T extends BaseNodeData = BaseNodeData> {
  id: string;
  type: string;
  position: NodeTransform;
  data: T;
}

export interface StudioEdge {
  id: string;
  channel: ConnectionChannel;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface INodeEditProps<T extends BaseNodeData> {
  nodeId: string;
  data: T;
  updateData: (newData: Partial<T>) => void;
}

export interface INodeComponentProps<T extends BaseNodeData> {
  id: string;
  data: T;
  inputs: IPort[];
  outputs: IPort[];
}

export interface NodeExecutionSnapshot {
  nodeId: string;
  state: NodeExecutionState;
  inputs: NodeExecutionInputMap;
  outputs: NodeExecutionOutputMap;
  error?: string;
  issues?: ValidationIssue[];
  startedAt?: number;
  completedAt?: number;
}

export type ParameterValueType = 'string';

export interface ParameterDefinitionValue {
  type: ParameterValueType;
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

export interface StudioNodeRuntimeState {
  displayName?: string;
  parameters: Record<string, unknown>;
  bindings: Record<string, ExpressionSource | ExpressionSource[]>;
  documentState: Record<string, unknown>;
}

export interface INodeDefinition<T extends BaseNodeData = BaseNodeData> {
  manifest: NodeManifest;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  createInitialData?: () => T;
  hydrateData?: (instance: import('../../domain/studio/contracts').NodeInstance, baseData: BaseNodeData) => T;
  dehydrateData?: (data: T, instance: import('../../domain/studio/contracts').NodeInstance) => StudioNodeRuntimeState;
  createRuntimeState?: (node: StudioNode<T>) => StudioNodeRuntimeState;
  executionContract?: NodeExecutionContract;
  getExecutionPreview?: (data: T) => NodeExecutionOutputMap | undefined;
  resolveDisplayName?: (data: T) => string | undefined;

  CanvasComponent: React.ComponentType<INodeComponentProps<T>>;
  EditComponent?: React.ComponentType<INodeEditProps<T>>;
  EditFooterComponent?: React.ComponentType<INodeEditProps<T>>;
}

export type StudioNodeDefinition = INodeDefinition<BaseNodeData>;

export type NodeExecutionState = 'idle' | 'running' | 'success' | 'error';

export type PortHandleType = 'source' | 'target';

export interface DraftConnection {
  sourceNodeId: string;
  sourcePortId: string;
  sourcePortType: PortType;
  sourceConnectionChannel: ConnectionChannel;
  sourceHandleType: PortHandleType;
  targetPos: { x: number; y: number };
  hoveredTargetNodeId?: string;
  hoveredTargetPortId?: string;
  hoveredTargetCompatible?: boolean;
}

export interface StudioConnection extends StudioEdge {}

export interface StudioConnectionTarget {
  nodeId: string;
  portId: string;
}

export interface DragExpressionPayloadRecord {
  mimeType: 'application/x-umdp-expression-source';
  payload: ExpressionReferenceDragPayload;
}

export const WORKFLOW_SCHEMA_IDS = {
  genericJson: 'studio.json.generic',
  classInfo: 'studio.class.info',
  instanceReference: 'studio.instance.reference',
  parameterDefinitions: 'studio.params.definition',
} as const;

export const PORT_COLORS: Record<PortType, string> = {
  flow: '#10b981',
  json: '#06b6d4',
};

export function getConnectionChannelForPortType(portType: PortType): ConnectionChannel {
  return portType === 'flow' ? 'control' : 'data';
}

export function getPortTypeForConnectionChannel(channel: ConnectionChannel): PortType {
  return channel === 'control' ? 'flow' : 'json';
}
