import type {
  CallFunctionResultPayload,
  ClassInfoPayload,
  ConnectionChannel,
  ExpressionReferenceDragPayload,
  ExpressionSource,
  JsonSchemaReference,
  NodeExecutionInputMap,
  NodeExecutionContract,
  NodeExecutionOutputMap,
  NodeExecutionSnapshot,
  NodeExecutionStatus,
  NodeManifest,
  ParameterDefinitionPayload,
  ValidationIssue,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';
export type {
  CallFunctionArgumentPayload,
  CallFunctionResultPayload,
  CallFunctionResultValuePayload,
  ClassInfoBasicPayload,
  ClassInfoFieldPayload,
  ClassInfoFunctionParameterPayload,
  ClassInfoFunctionPayload,
  ClassInfoPayload,
  InstanceReferencePayload,
  InstanceReferenceSourceKind,
  JsonSchemaReference,
  NodeExecutionInputMap,
  NodeExecutionOutputMap,
  NodeExecutionSnapshot,
  NodeExecutionSource,
  NodeExecutionStatus,
  NodeExecutionTiming,
  ParameterDefinitionPayload,
  ParameterDefinitionValue,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';
export { WORKFLOW_SCHEMA_IDS } from '../../domain/studio/contracts';

export type PortType = 'flow' | 'json';
export type ConnectionDirection = 'input' | 'output';

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

export type ParameterValueType = 'string';

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

export type NodeExecutionState = NodeExecutionStatus;

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
