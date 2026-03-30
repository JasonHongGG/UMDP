import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '../contracts';
import type { SystemContractVersions, WorkspaceLifecycleState } from '@/shared/contracts';

export interface AttachToProcessRequest {
  pid: number;
  name: string;
}

export interface RuntimeInstanceFieldsRequest {
  classStableId: string;
  instanceAddress: string;
}

export interface ReparentSceneObjectRequest {
  objectAddress: string;
  parentObjectAddress?: string | null;
  parentPath?: string | null;
}

export interface AnalysisRepository {
  attachToProcess(request: AttachToProcessRequest): Promise<ProcessSession>;
  getContractVersions(): Promise<SystemContractVersions>;
  getWorkspaceLifecycle(): Promise<WorkspaceLifecycleState>;
  loadAllMetadata(): Promise<AnalysisSnapshot>;
  getRuntimeStaticFields(classStableId: string): Promise<RuntimeOverlaySnapshot>;
  getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest): Promise<RuntimeInstanceFieldSnapshot>;
  startSceneRefresh(): Promise<SceneWorkspaceState>;
  getSceneWorkspaceState(): Promise<SceneWorkspaceState>;
  getSceneObjectChildren(objectAddress: string): Promise<RuntimeSceneChildrenSnapshot>;
  startSceneObjectChildrenAnalysis(objectAddress: string): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  getSceneObjectChildrenState(objectAddress: string): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  cancelSceneObjectChildrenAnalysis(objectAddress: string, taskId?: number): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  getSceneObjectInspector(objectAddress: string): Promise<RuntimeSceneObjectInspectorSnapshot>;
  startSceneObjectInspectorAnalysis(objectAddress: string): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  getSceneObjectInspectorState(): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  cancelSceneObjectInspectorAnalysis(taskId?: number): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  createSceneRoot(sceneHandle: number, name: string): Promise<RuntimeSceneMutationResult>;
  createSceneChild(parentObjectAddress: string, name: string): Promise<RuntimeSceneMutationResult>;
  duplicateSceneObject(objectAddress: string): Promise<RuntimeSceneMutationResult>;
  deleteSceneObject(objectAddress: string): Promise<RuntimeSceneMutationResult>;
  renameSceneObject(objectAddress: string, name: string): Promise<RuntimeSceneMutationResult>;
  setSceneObjectTag(objectAddress: string, tag: string): Promise<RuntimeSceneMutationResult>;
  setSceneObjectLayer(objectAddress: string, layer: number): Promise<RuntimeSceneMutationResult>;
  setSceneObjectHideFlags(objectAddress: string, hideFlags: string): Promise<RuntimeSceneMutationResult>;
  reparentSceneObject(request: ReparentSceneObjectRequest): Promise<RuntimeSceneMutationResult>;
  setSceneObjectActive(objectAddress: string, activeSelf: boolean): Promise<RuntimeSceneMutationResult>;
  setSceneObjectTransform(objectAddress: string, transformUpdate: RuntimeSceneTransformUpdate): Promise<RuntimeSceneMutationResult>;
  setSceneBehaviourEnabled(componentAddress: string, enabled: boolean): Promise<RuntimeSceneMutationResult>;
  createSceneComponent(objectAddress: string, componentTypeName: string): Promise<RuntimeSceneMutationResult>;
  deleteSceneComponent(componentAddress: string): Promise<RuntimeSceneMutationResult>;
  loadSceneByBuildIndex(buildIndex: number): Promise<RuntimeSceneMutationResult>;
}
