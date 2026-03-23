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
  NodeExecutionProgress,
  NodeExecutionSnapshot,
  NodeExecutionStatus,
  NodeManifest,
  ParameterDefinitionPayload,
  ParameterValueType,
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
  NodeExecutionProgress,
  NodeExecutionSnapshot,
  NodeExecutionStatus,
  NodeExecutionTiming,
  ParameterDefinitionPayload,
  ParameterDefinitionValue,
  ParameterValueType,
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

export interface StudioNodeRuntimeState {
  displayName?: string;
  parameters: Record<string, unknown>;
  bindings: Record<string, ExpressionSource | ExpressionSource[]>;
  documentState: Record<string, unknown>;
}

export interface StudioNodeIdentityDefinition {
  manifest: NodeManifest;
}

export interface StudioNodePresentationDefinition<T extends BaseNodeData = BaseNodeData> {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  resolveDisplayName?: (data: T) => string | undefined;
  CanvasComponent: React.ComponentType<INodeComponentProps<T>>;
  EditComponent?: React.ComponentType<INodeEditProps<T>>;
  EditFooterComponent?: React.ComponentType<INodeEditProps<T>>;
}

export interface StudioNodeSerializationDefinition<T extends BaseNodeData = BaseNodeData> {
  createInitialData?: () => T;
  hydrateData?: (instance: import('../../domain/studio/contracts').NodeInstance, baseData: BaseNodeData) => T;
  dehydrateData?: (data: T, instance: import('../../domain/studio/contracts').NodeInstance) => StudioNodeRuntimeState;
  createRuntimeState?: (node: StudioNode<T>) => StudioNodeRuntimeState;
}

export interface StudioNodeExecutionDefinition {
  executionContract?: NodeExecutionContract;
}

export interface StudioNodeLifecycleDefinition<T extends BaseNodeData = BaseNodeData> {
  observeGraphNode?: (
    node: StudioNode<T>,
    context: import('./nodeCapabilities').StudioNodeLifecycleContext,
  ) => void;
  reconcileData?: (
    node: StudioNode<T>,
    context: import('./nodeCapabilities').StudioNodeLifecycleContext,
  ) => Partial<T> | null;
}

export interface StudioNodeQueryDefinition<T extends BaseNodeData = BaseNodeData> {
  buildQueryOutputs?: (
    node: StudioNode<T>,
    context: import('./queryTypes').StudioNodeQueryContext,
    dependencySnapshots: Record<string, NodeExecutionSnapshot>,
  ) => NodeExecutionOutputMap | null;
  buildQueryState?: (
    node: StudioNode<T>,
    context: import('./queryTypes').StudioNodeQueryContext,
  ) => unknown;
}

export interface StudioNodeDefinition<T extends BaseNodeData = BaseNodeData>
  extends StudioNodeIdentityDefinition,
    StudioNodePresentationDefinition<T>,
    StudioNodeSerializationDefinition<T>,
    StudioNodeExecutionDefinition,
    StudioNodeLifecycleDefinition<T>,
    StudioNodeQueryDefinition<T> {}

export function getStudioNodePresentationDefinition<T extends BaseNodeData = BaseNodeData>(nodeDefinition: StudioNodeDefinition<T>): StudioNodePresentationDefinition<T> {
  return nodeDefinition;
}

export function getStudioNodeSerializationDefinition<T extends BaseNodeData = BaseNodeData>(nodeDefinition: StudioNodeDefinition<T>): StudioNodeSerializationDefinition<T> {
  return nodeDefinition;
}

export function getStudioNodeExecutionDefinition<T extends BaseNodeData = BaseNodeData>(nodeDefinition: StudioNodeDefinition<T>): StudioNodeExecutionDefinition {
  return nodeDefinition;
}

export function getStudioNodeLifecycleDefinition<T extends BaseNodeData = BaseNodeData>(nodeDefinition: StudioNodeDefinition<T>): StudioNodeLifecycleDefinition<T> {
  return nodeDefinition;
}

export function getStudioNodeQueryDefinition<T extends BaseNodeData = BaseNodeData>(nodeDefinition: StudioNodeDefinition<T>): StudioNodeQueryDefinition<T> {
  return nodeDefinition;
}

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
