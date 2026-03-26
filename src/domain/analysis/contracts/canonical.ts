import type { StableId } from '../../contracts/shared-identity';

export type RuntimeFlavor = 'mono' | 'il2cpp' | 'unknown';

export interface ProcessInfo {
  pid: number;
  name: string;
}

export interface ProcessSession {
  pid: number;
  processName: string;
  exePath: string;
  dataDir: string | null;
  managedDir: string | null;
  runtime: RuntimeFlavor;
}

export interface AnalysisSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  process: ProcessSession | null;
  images: ImageDescriptor[];
  classes: Record<StableId, ClassDescriptor>;
  imageClassIndex: Record<StableId, StableId[]>;
}

export interface RuntimeOverlaySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  classes: Record<StableId, RuntimeClassOverlayDescriptor>;
}

export interface ImageDescriptor {
  stableId: StableId;
  name: string;
  path: string;
}

export interface InheritanceDescriptor {
  name: string;
}

export interface FieldDescriptor {
  stableId: StableId;
  name: string;
  fieldType: string;
  offset: string | null;
}

export interface StaticFieldDescriptor extends FieldDescriptor {
  address: string | null;
  value: string | null;
}

export interface MethodParameterDescriptor {
  position: number;
  name: string;
  typeName: string;
}

export interface MethodDescriptor {
  stableId: StableId;
  name: string;
  signature: string;
  returnType: string;
  parameters: MethodParameterDescriptor[];
  isStatic: boolean;
  tags: string[];
}

export interface RuntimeResolvedFieldDescriptor extends FieldDescriptor {
  address: string | null;
  value: string | null;
}

export interface ClassDescriptor {
  stableId: StableId;
  imageStableId: StableId;
  name: string;
  namespace: string;
  fullName: string;
  inheritance: InheritanceDescriptor[];
  fields: FieldDescriptor[];
  staticFields: StaticFieldDescriptor[];
  methods: MethodDescriptor[];
}

export interface RuntimeClassOverlayDescriptor {
  classStableId: StableId;
  fields: FieldDescriptor[];
  staticFields: StaticFieldDescriptor[];
}

export interface RuntimeInstanceFieldSnapshot {
  classStableId: StableId;
  instanceAddress: string;
  fields: RuntimeResolvedFieldDescriptor[];
}

export type RuntimeInvokeArgumentKind = 'null' | 'boolean' | 'number' | 'string' | 'address';

export type RuntimeInvokeFailureKind =
  | 'none'
  | 'not-attached'
  | 'metadata-unavailable'
  | 'class-not-found'
  | 'method-not-found'
  | 'instance-required'
  | 'argument-mismatch'
  | 'bridge-launch-failed'
  | 'bridge-failed'
  | 'bridge-parse-failed'
  | 'runtime-exception'
  | 'unknown';

export interface RuntimeMethodInvokeArgument {
  name: string;
  typeName: string;
  valueKind: RuntimeInvokeArgumentKind;
  value: string | null;
}

export interface RuntimeMethodInvokeRequest {
  classStableId: StableId;
  methodStableId: StableId;
  instanceAddress: string | null;
  arguments: RuntimeMethodInvokeArgument[];
}

export interface RuntimeMethodInvokeValue {
  kind: string;
  value: string | null;
  objectAddress: string | null;
}

export interface RuntimeMethodInvokeResult {
  classStableId: StableId;
  methodStableId: StableId;
  methodName: string;
  methodSignature: string;
  returnType: string;
  success: boolean;
  failureKind: RuntimeInvokeFailureKind;
  error: string | null;
  exception: string | null;
  result: RuntimeMethodInvokeValue | null;
}

export type RuntimeFieldValueKind = 'boolean' | 'integer' | 'float' | 'string' | 'address';

export type RuntimeFieldSetFailureKind =
  | 'none'
  | 'not-attached'
  | 'metadata-unavailable'
  | 'class-not-found'
  | 'field-not-found'
  | 'instance-required'
  | 'address-mismatch'
  | 'unsupported-type'
  | 'invalid-value'
  | 'bridge-launch-failed'
  | 'bridge-failed'
  | 'bridge-parse-failed'
  | 'write-failed'
  | 'unknown';

export interface RuntimeFieldSetRequest {
  classStableId: StableId;
  memberStableId: StableId;
  fieldName: string;
  fieldTypeName: string;
  isStatic: boolean;
  instanceAddress: string | null;
  targetAddress: string | null;
  valueKind: RuntimeFieldValueKind;
  serializedValue: string | null;
}

export interface RuntimeFieldSetResult {
  classStableId: StableId;
  memberStableId: StableId;
  fieldName: string;
  fieldTypeName: string;
  isStatic: boolean;
  address: string | null;
  success: boolean;
  failureKind: RuntimeFieldSetFailureKind;
  error: string | null;
  previousValue: string | null;
  appliedValue: string | null;
}

export type SceneRefreshStatus = 'idle' | 'refreshing' | 'ready' | 'error';

export interface RuntimeVector3Snapshot {
  x: number;
  y: number;
  z: number;
}

export interface RuntimeQuaternionSnapshot {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RuntimeSceneNodeSummary {
  objectAddress: string;
  transformAddress: string | null;
  name: string;
  activeSelf: boolean;
  childCount: number;
  hasChildren: boolean;
  componentCount: number | null;
  layer: number | null;
  tag: string | null;
}

export interface RuntimeSceneDescriptor {
  sceneHandle: number;
  name: string;
  isLoaded: boolean;
  roots: RuntimeSceneNodeSummary[];
}

export interface RuntimeSceneCatalogSnapshot {
  generatedAt: string;
  scenes: RuntimeSceneDescriptor[];
}

export interface RuntimeSceneComponentSummary {
  componentAddress: string;
  typeName: string;
}

export interface RuntimeSceneTransformSnapshot {
  transformAddress: string;
  localPosition: RuntimeVector3Snapshot | null;
  localRotation: RuntimeQuaternionSnapshot | null;
  localScale: RuntimeVector3Snapshot | null;
  parentTransformAddress: string | null;
  parentObjectAddress: string | null;
  childCount: number;
}

export interface RuntimeSceneChildrenSnapshot {
  parentObjectAddress: string;
  children: RuntimeSceneNodeSummary[];
}

export interface RuntimeSceneObjectInspectorSnapshot {
  generatedAt: string;
  sceneHandle: number | null;
  sceneName: string | null;
  object: RuntimeSceneNodeSummary;
  parent: RuntimeSceneNodeSummary | null;
  children: RuntimeSceneNodeSummary[];
  components: RuntimeSceneComponentSummary[];
  transform: RuntimeSceneTransformSnapshot | null;
}

export interface SceneWorkspaceState {
  refreshStatus: SceneRefreshStatus;
  errorMessage: string | null;
  snapshot: RuntimeSceneCatalogSnapshot | null;
  lastUpdatedAt: string | null;
}