import type {
  ProcessWindowCandidate,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';

export interface ReparentSceneObjectRequest {
  objectAddress: string;
  parentObjectAddress?: string | null;
  parentPath?: string | null;
}

export interface SceneGateway {
  startSceneRefresh(): Promise<SceneWorkspaceState>;
  getSceneWorkspaceState(): Promise<SceneWorkspaceState>;
  listScenePickerWindows(): Promise<ProcessWindowCandidate[]>;
  getSceneMousePickerState(): Promise<RuntimeSceneMousePickerSnapshot>;
  setSceneMousePickerTarget(windowHandle: string | null): Promise<RuntimeSceneMousePickerSnapshot>;
  startSceneMousePicker(): Promise<RuntimeSceneMousePickerSnapshot>;
  stopSceneMousePicker(): Promise<RuntimeSceneMousePickerSnapshot>;
  getSceneObjectChildren(objectAddress: string): Promise<RuntimeSceneChildrenSnapshot>;
  startSceneObjectChildrenAnalysis(objectAddress: string): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  getSceneObjectChildrenState(objectAddress: string): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  cancelSceneObjectChildrenAnalysis(objectAddress: string, taskId?: number): Promise<RuntimeSceneObjectChildrenTaskState | null>;
  startSceneObjectHeaderAnalysis(objectAddress: string): Promise<RuntimeSceneObjectHeaderTaskState | null>;
  getSceneObjectHeaderState(objectAddress: string): Promise<RuntimeSceneObjectHeaderTaskState | null>;
  cancelSceneObjectHeaderAnalysis(objectAddress: string, taskId?: number): Promise<RuntimeSceneObjectHeaderTaskState | null>;
  startSceneObjectComponentsAnalysis(objectAddress: string): Promise<RuntimeSceneObjectComponentsTaskState | null>;
  getSceneObjectComponentsState(objectAddress: string): Promise<RuntimeSceneObjectComponentsTaskState | null>;
  cancelSceneObjectComponentsAnalysis(objectAddress: string, taskId?: number): Promise<RuntimeSceneObjectComponentsTaskState | null>;
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