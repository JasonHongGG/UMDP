export type PortType = 'flow' | 'json';

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
  description?: string;
  schema?: JsonSchemaReference;
}

export interface BaseNodeData extends Record<string, unknown> {
  nodeName?: string;
  inputs: IPort[];
  outputs: IPort[];
}

export interface NodeTransform {
  x: number;
  y: number;
}

export interface WorkflowDocument {
  version: number;
  nodes: StudioNode[];
  edges: StudioEdge[];
}

export interface StudioNode<T extends BaseNodeData = BaseNodeData> {
  id: string;
  type: string;
  position: NodeTransform;
  data: T;
}

export interface StudioEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface INodeEditProps<T extends BaseNodeData> {
  nodeId: string;
  data: T;
  updateData: (newData: Partial<T>) => void;
  updatePorts: (inputs: IPort[], outputs: IPort[]) => void;
}

export interface INodeComponentProps<T extends BaseNodeData> {
  id: string;
  data: T;
}

export interface ClassBinding {
  imageId: string;
  classId: string;
  fullName: string;
  name: string;
  namespace: string;
  imageName: string;
}

export interface ClassInfoItemDescriptor {
  id: string;
  label: string;
  detail?: string;
}

export interface ClassInfoCatalog {
  members: ClassInfoItemDescriptor[];
  statics: ClassInfoItemDescriptor[];
  functions: ClassInfoItemDescriptor[];
}

export interface ClassInfoSelection {
  members: string[];
  statics: string[];
  functions: string[];
}

export interface PendingClassNodeRequest {
  requestId: string;
  binding: ClassBinding;
  availableInfo: ClassInfoCatalog;
  suggestedPosition?: NodeTransform;
}

export interface StudioClassCatalogEntry extends ClassBinding {
  searchText: string;
}

export interface NodeExecutionContext<T extends BaseNodeData = BaseNodeData> {
  node: StudioNode<T>;
  nodes: StudioNode[];
  edges: StudioEdge[];
  incoming: NodeExecutionInputMap;
}

export interface NodeValidationResult {
  valid: boolean;
  error?: string;
}

export interface NodeValidationContext<T extends BaseNodeData = BaseNodeData> extends NodeExecutionContext<T> {}

export interface NodeExecutionResult {
  state: Extract<NodeExecutionState, 'success' | 'error'>;
  outputs?: NodeExecutionOutputMap;
  error?: string;
}

export interface NodeExecutionSnapshot {
  nodeId: string;
  state: NodeExecutionState;
  inputs: NodeExecutionInputMap;
  outputs: NodeExecutionOutputMap;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ClassInfoPayload {
  binding: ClassBinding;
  selected: ClassInfoSelection;
  info: {
    members: Record<string, WorkflowJsonValue>;
    statics: Record<string, WorkflowJsonValue>;
    functions: Array<{ id: string; label: string }>;
  };
}

export interface INodeDefinition<T extends BaseNodeData = BaseNodeData> {
  typeId: string;
  displayName: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  category?: string;
  tags?: string[];
  defaultInputs: IPort[];
  defaultOutputs: IPort[];
  defaultData?: Partial<T>;
  createInitialData?: () => T;
  validateExecution?: (context: NodeValidationContext<T>) => NodeValidationResult;
  execute?: (context: NodeExecutionContext<T>) => NodeExecutionResult;

  CanvasComponent: React.ComponentType<INodeComponentProps<T>>;
  EditComponent?: React.ComponentType<INodeEditProps<T>>;
}

export type StudioNodeDefinition = INodeDefinition<BaseNodeData>;

export type NodeExecutionState = 'idle' | 'running' | 'success' | 'error';

export type PortHandleType = 'source' | 'target';

export interface DraftConnection {
  sourceNodeId: string;
  sourcePortId: string;
  sourcePortType: PortType;
  sourceHandleType: PortHandleType;
  targetPos: { x: number; y: number };
  hoveredTargetNodeId?: string;
  hoveredTargetPortId?: string;
  hoveredTargetCompatible?: boolean;
}

export const WORKFLOW_SCHEMA_IDS = {
  genericJson: 'studio.json.generic',
  classInfo: 'studio.class.info',
  instanceReference: 'studio.instance.reference',
} as const;

export const PORT_COLORS: Record<PortType, string> = {
  flow: '#10b981',
  json: '#06b6d4',
};
