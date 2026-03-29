import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneObjectInspectorSnapshot,
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
  getSceneObjectInspector(objectAddress: string): Promise<RuntimeSceneObjectInspectorSnapshot>;
  startSceneObjectInspectorAnalysis(objectAddress: string): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  getSceneObjectInspectorState(): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  cancelSceneObjectInspectorAnalysis(taskId?: number): Promise<RuntimeSceneObjectInspectorTaskState | null>;
  createSceneChild(parentObjectAddress: string, name: string): Promise<RuntimeSceneMutationResult>;
  duplicateSceneObject(objectAddress: string): Promise<RuntimeSceneMutationResult>;
  deleteSceneObject(objectAddress: string): Promise<RuntimeSceneMutationResult>;
  setSceneObjectActive(objectAddress: string, activeSelf: boolean): Promise<RuntimeSceneMutationResult>;
}
