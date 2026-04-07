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

export interface RuntimeScreenPoint {
  x: number;
  y: number;
}

export interface RuntimeScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ProcessWindowCandidate {
  pid: number;
  windowHandle: string;
  title: string;
  className: string;
  windowRect: RuntimeScreenRect;
  clientRect: RuntimeScreenRect;
  isVisible: boolean;
  isMinimized: boolean;
  isForeground: boolean;
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
  | 'invalid-address'
  | 'capability-unavailable'
  | 'runtime-unavailable'
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
  | 'invalid-address'
  | 'address-mismatch'
  | 'capability-unavailable'
  | 'runtime-unavailable'
  | 'unsupported-type'
  | 'invalid-value'
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

export type SceneResourceFreshness = 'empty' | 'fresh' | 'refreshing' | 'stale' | 'error';

export type RuntimeSceneSnapshotKind = 'empty' | 'retained' | 'fresh';

export type RuntimeSceneResourceKind = 'catalog' | 'children' | 'scene-object-header' | 'scene-object-components';

export interface RuntimeSceneResourceState {
  resourceKind: RuntimeSceneResourceKind;
  resourceRevision: number;
  sessionKey: string | null;
  freshness: SceneResourceFreshness;
  lastSuccessfulAt: string | null;
  isRetainingSnapshot: boolean;
  snapshotKind: RuntimeSceneSnapshotKind;
  errorMessage: string | null;
}

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
  parentObjectAddress: string | null;
  name: string;
  activeSelf: boolean;
  isStatic: boolean | null;
  childCount: number;
  hasChildren: boolean;
  componentCount: number | null;
  layer: number | null;
  tag: string | null;
  hideFlags: string | null;
  path: string | null;
}

export type RuntimeSceneKind = 'loaded' | 'dont-destroy-on-load' | 'hide-and-dont-save';

export interface RuntimeSceneBuildSettingsEntry {
  buildIndex: number;
  path: string;
  name: string;
  isLoaded: boolean;
}

export interface RuntimeSceneDescriptor {
  sceneHandle: number;
  name: string;
  isLoaded: boolean;
  kind: RuntimeSceneKind;
  buildIndex: number | null;
  path: string | null;
  roots: RuntimeSceneNodeSummary[];
}

export interface RuntimeSceneCatalogSnapshot {
  generatedAt: string;
  scenes: RuntimeSceneDescriptor[];
  buildSettingsScenes: RuntimeSceneBuildSettingsEntry[];
}

export interface RuntimeSceneComponentSummary {
  componentAddress: string;
  typeName: string;
  isBehaviour: boolean;
  behaviourEnabled: boolean | null;
}

export interface RuntimeSceneHierarchyPathEntry {
  objectAddress: string;
  name: string;
}

export interface RuntimeSceneTransformSnapshot {
  transformAddress: string;
  worldPosition: RuntimeVector3Snapshot | null;
  localPosition: RuntimeVector3Snapshot | null;
  localRotation: RuntimeQuaternionSnapshot | null;
  localEulerAngles: RuntimeVector3Snapshot | null;
  localScale: RuntimeVector3Snapshot | null;
  parentTransformAddress: string | null;
  parentObjectAddress: string | null;
  childCount: number;
}

export interface RuntimeSceneTransformUpdate {
  worldPosition?: RuntimeVector3Snapshot | null;
  localPosition?: RuntimeVector3Snapshot | null;
  localRotation?: RuntimeQuaternionSnapshot | null;
  localEulerAngles?: RuntimeVector3Snapshot | null;
  localScale?: RuntimeVector3Snapshot | null;
}

export interface RuntimeSceneChildrenSnapshot {
  parentObjectAddress: string;
  children: RuntimeSceneNodeSummary[];
}

export interface RuntimeSceneChildrenPageSnapshot {
  generatedAt: string;
  parentObjectAddress: string;
  offset: number;
  totalCount: number;
  nextOffset: number | null;
  children: RuntimeSceneNodeSummary[];
}

export type RuntimeSceneChildrenTaskStatus =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface RuntimeSceneObjectChildrenTaskState {
  taskId: number;
  resourceRevision: number;
  sessionKey: string | null;
  parentObjectAddress: string;
  status: RuntimeSceneChildrenTaskStatus;
  mutationEpoch: number;
  startedAt: string;
  updatedAt: string;
  children: RuntimeSceneNodeSummary[];
  totalCount: number;
  loadedCount: number;
  nextOffset: number | null;
  errorMessage: string | null;
  isStale: boolean;
  resourceState: RuntimeSceneResourceState;
}

export interface RuntimeSceneComponentsPageSnapshot {
  generatedAt: string;
  objectAddress: string;
  offset: number;
  totalCount: number;
  nextOffset: number | null;
  components: RuntimeSceneComponentSummary[];
}

export interface RuntimeSceneObjectInspectorHeaderSnapshot {
  generatedAt: string;
  sceneHandle: number | null;
  sceneName: string | null;
  sceneKind: RuntimeSceneKind | null;
  object: RuntimeSceneNodeSummary;
  parent: RuntimeSceneNodeSummary | null;
  hierarchyPath: RuntimeSceneHierarchyPathEntry[];
  transform: RuntimeSceneTransformSnapshot | null;
}

export type RuntimeSceneObjectHeaderTaskStatus =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface RuntimeSceneObjectHeaderTaskState {
  taskId: number;
  resourceRevision: number;
  sessionKey: string | null;
  objectAddress: string;
  status: RuntimeSceneObjectHeaderTaskStatus;
  mutationEpoch: number;
  startedAt: string;
  updatedAt: string;
  header: RuntimeSceneObjectInspectorHeaderSnapshot | null;
  errorMessage: string | null;
  isStale: boolean;
  resourceState: RuntimeSceneResourceState;
}

export type RuntimeSceneObjectComponentsTaskStatus =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface RuntimeSceneObjectComponentsTaskState {
  taskId: number;
  resourceRevision: number;
  sessionKey: string | null;
  objectAddress: string;
  status: RuntimeSceneObjectComponentsTaskStatus;
  mutationEpoch: number;
  startedAt: string;
  updatedAt: string;
  components: RuntimeSceneComponentSummary[];
  totalCount: number;
  loadedCount: number;
  nextOffset: number | null;
  errorMessage: string | null;
  isStale: boolean;
  resourceState: RuntimeSceneResourceState;
}

export interface RuntimeSceneObjectInspectorSnapshot {
  generatedAt: string;
  sceneHandle: number | null;
  sceneName: string | null;
  sceneKind: RuntimeSceneKind | null;
  object: RuntimeSceneNodeSummary;
  parent: RuntimeSceneNodeSummary | null;
  hierarchyPath: RuntimeSceneHierarchyPathEntry[];
  children: RuntimeSceneNodeSummary[];
  components: RuntimeSceneComponentSummary[];
  transform: RuntimeSceneTransformSnapshot | null;
}

export type RuntimeSceneMutationOperation =
  | 'create-child'
  | 'create-root'
  | 'duplicate'
  | 'delete'
  | 'rename'
  | 'set-tag'
  | 'set-layer'
  | 'set-hide-flags'
  | 'reparent'
  | 'set-active'
  | 'set-transform'
  | 'set-behaviour-enabled'
  | 'add-component'
  | 'remove-component'
  | 'load-scene';

export interface RuntimeSceneSelectionHint {
  sceneHandle: number | null;
  objectAddress: string;
  ancestorObjectAddresses: string[];
}

export interface RuntimeSceneAffectedResource {
  resourceKind: RuntimeSceneResourceKind;
  objectAddress: string | null;
}

export interface RuntimeSceneMutationResult {
  operation: RuntimeSceneMutationOperation;
  sceneHandle: number | null;
  targetObjectAddress: string | null;
  parentObjectAddress: string | null;
  object: RuntimeSceneNodeSummary | null;
  deletedObjectAddress: string | null;
  preferredSelectionAddress: string | null;
  preferredSelectionHint: RuntimeSceneSelectionHint | null;
  activeSelf: boolean | null;
  tag: string | null;
  layer: number | null;
  hideFlags: string | null;
  behaviourEnabled: boolean | null;
  hierarchyPath: RuntimeSceneHierarchyPathEntry[];
  transform: RuntimeSceneTransformSnapshot | null;
  affectedResources: RuntimeSceneAffectedResource[];
}

export type RuntimeSceneMousePickerStatus =
  | 'idle'
  | 'armed'
  | 'observing'
  | 'cancelled'
  | 'error';

export interface RuntimeSceneMouseTargetHit {
  observedAt: string;
  objectAddress: string;
  objectName: string;
  transformAddress: string | null;
  sceneHandle: number | null;
  sceneName: string | null;
  sceneKind: RuntimeSceneKind | null;
  hierarchyPath: RuntimeSceneHierarchyPathEntry[];
  distance: number | null;
  screenPosition: RuntimeScreenPoint;
  clientPosition: RuntimeScreenPoint;
}

export interface RuntimeSceneMousePickerSnapshot {
  resourceRevision: number;
  sessionKey: string | null;
  status: RuntimeSceneMousePickerStatus;
  statusDetail: string | null;
  isRunning: boolean;
  targetWindow: ProcessWindowCandidate | null;
  cursorScreenPosition: RuntimeScreenPoint | null;
  cursorClientPosition: RuntimeScreenPoint | null;
  cursorInsideClient: boolean;
  hoverHit: RuntimeSceneMouseTargetHit | null;
  recentHits: RuntimeSceneMouseTargetHit[];
  lastUpdatedAt: string | null;
  errorMessage: string | null;
}

export interface SceneWorkspaceState {
  resourceRevision: number;
  sessionKey: string | null;
  refreshStatus: SceneRefreshStatus;
  errorMessage: string | null;
  mutationEpoch: number;
  snapshot: RuntimeSceneCatalogSnapshot | null;
  lastUpdatedAt: string | null;
  resourceState: RuntimeSceneResourceState;
}