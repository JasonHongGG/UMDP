import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RuntimeQuaternionSnapshot,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneComponentSummary,
  RuntimeSceneMutationOperation,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneTransformSnapshot,
  RuntimeSceneTransformUpdate,
  RuntimeVector3Snapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import {
  onSceneObjectChildrenTaskUpdated,
  onSceneObjectInspectorTaskUpdated,
  onSceneWorkspaceStateUpdated,
} from '@/infrastructure/tauri/TauriSceneEvents';
import type { WorkspaceLifecycleState, WorkspaceTaskScope, WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  adjustChildrenCounts,
  adjustNodeChildCountInList,
  adjustInspectorCounts,
  buildInspectorSnapshot,
  EMPTY_SCENE_WORKSPACE_STATE,
  insertChildIntoInspectors,
  insertChildNode,
  insertRootNode,
  isTerminalChildrenTaskStatus,
  isTerminalInspectorTaskStatus,
  logSceneError,
  logScenePerf,
  mergeInspectorCaches,
  patchChildrenWithSummaries,
  patchChildrenWithSummary,
  patchInspectorTransform,
  patchInspectorsWithSummaries,
  patchInspectorsWithSummary,
  patchRootsWithSummaries,
  patchRootsWithSummary,
  removeChildNode,
  removeNodeEverywhere,
  removeNodeFromInspectors,
  removeRootNode,
  sameNodeOrder,
  waitForNextPaint,
} from './sceneWorkspaceStatePatches';
import { collectSceneWorkspaceTasks } from './sceneWorkspaceTasks';

type SceneMutationState = {
  operation: RuntimeSceneMutationOperation | null;
  loading: boolean;
  errorMessage: string | null;
  task: WorkspaceTaskSnapshot | null;
};

const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
  task: null,
};

export interface SceneWorkspaceStateResult {
  sceneWorkspace: SceneWorkspaceState;
  refreshSceneWorkspace: () => Promise<void>;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
  ensureSceneObjectChildrenLoaded: (objectAddress: string, force?: boolean) => Promise<void>;
  stopSceneObjectChildrenObservation: (objectAddress: string) => void;
  sceneInspector: RuntimeSceneObjectInspectorSnapshot | null;
  sceneInspectorTaskState: RuntimeSceneObjectInspectorTaskState | null;
  sceneInspectorLoading: boolean;
  sceneInspectorChildrenLoading: boolean;
  sceneInspectorComponentsLoading: boolean;
  sceneInspectorError: string | null;
  createSceneRoot: (sceneHandle: number, name: string) => Promise<RuntimeSceneMutationResult | null>;
  createSceneChild: (name: string) => Promise<RuntimeSceneMutationResult | null>;
  duplicateSceneObject: () => Promise<RuntimeSceneMutationResult | null>;
  deleteSceneObject: () => Promise<RuntimeSceneMutationResult | null>;
  renameSceneObject: (name: string) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectTag: (tag: string) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectLayer: (layer: number) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectHideFlags: (hideFlags: string) => Promise<RuntimeSceneMutationResult | null>;
  reparentSceneObject: (parentObjectAddress?: string | null, parentPath?: string | null) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectActive: (activeSelf: boolean) => Promise<RuntimeSceneMutationResult | null>;
  setSceneObjectTransform: (transformUpdate: RuntimeSceneTransformUpdate) => Promise<RuntimeSceneMutationResult | null>;
  setSceneBehaviourEnabled: (componentAddress: string, enabled: boolean) => Promise<RuntimeSceneMutationResult | null>;
  createSceneComponent: (componentTypeName: string) => Promise<RuntimeSceneMutationResult | null>;
  deleteSceneComponent: (componentAddress: string) => Promise<RuntimeSceneMutationResult | null>;
  loadSceneByBuildIndex: (buildIndex: number) => Promise<RuntimeSceneMutationResult | null>;
  sceneMutationState: SceneMutationState;
  activeSceneTask: WorkspaceTaskSnapshot | null;
  sceneTasks: WorkspaceTaskSnapshot[];
  sceneRootsByHandle: Record<number, RuntimeSceneNodeSummary[]>;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sceneMutationTaskScope(operation: RuntimeSceneMutationOperation): WorkspaceTaskScope {
  return operation === 'load-scene' || operation === 'create-root' ? 'resource' : 'selection';
}

export function useSceneWorkspaceState({
  repository,
  workspaceLifecycle,
  active,
}: {
  repository: SceneGateway;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
}): SceneWorkspaceStateResult {
  const [sceneWorkspace, setSceneWorkspace] = useState<SceneWorkspaceState>(EMPTY_SCENE_WORKSPACE_STATE);
  const [selectedObjectAddress, setSelectedObjectAddress] = useState<string | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, RuntimeSceneNodeSummary[]>>({});
  const [childTaskByParent, setChildTaskByParent] = useState<Record<string, RuntimeSceneObjectChildrenTaskState>>({});
  const [loadingChildrenByParent, setLoadingChildrenByParent] = useState<Record<string, boolean>>({});
  const [childErrorByParent, setChildErrorByParent] = useState<Record<string, string | null>>({});
  const [inspectorsByAddress, setInspectorsByAddress] = useState<Record<string, RuntimeSceneObjectInspectorSnapshot>>({});
  const [inspectorTaskByAddress, setInspectorTaskByAddress] = useState<Record<string, RuntimeSceneObjectInspectorTaskState>>({});
  const [inspectorLoadingByAddress, setInspectorLoadingByAddress] = useState<Record<string, boolean>>({});
  const [inspectorErrorByAddress, setInspectorErrorByAddress] = useState<Record<string, string | null>>({});
  const [sceneMutationState, setSceneMutationState] = useState<SceneMutationState>(EMPTY_MUTATION_STATE);
  const processKeyRef = useRef<string | null>(null);
  const childrenByParentRef = useRef(childrenByParent);
  const childTaskByParentRef = useRef(childTaskByParent);
  const inspectorsByAddressRef = useRef(inspectorsByAddress);
  const inspectorTaskByAddressRef = useRef(inspectorTaskByAddress);
  const inspectorLoadingByAddressRef = useRef(inspectorLoadingByAddress);
  const childPollTokensRef = useRef<Record<string, number>>({});
  const activeChildTaskIdByParentRef = useRef<Record<string, number | null>>({});
  const activeInspectorTaskIdRef = useRef<number | null>(null);
  const inspectorPollTokenRef = useRef(0);
  const sceneMutationTaskCounterRef = useRef(0);

  useEffect(() => {
    childrenByParentRef.current = childrenByParent;
  }, [childrenByParent]);

  useEffect(() => {
    childTaskByParentRef.current = childTaskByParent;
  }, [childTaskByParent]);

  useEffect(() => {
    inspectorsByAddressRef.current = inspectorsByAddress;
  }, [inspectorsByAddress]);

  useEffect(() => {
    inspectorTaskByAddressRef.current = inspectorTaskByAddress;
  }, [inspectorTaskByAddress]);

  useEffect(() => {
    inspectorLoadingByAddressRef.current = inspectorLoadingByAddress;
  }, [inspectorLoadingByAddress]);

  const resetSceneState = useCallback(() => {
    setSceneWorkspace(EMPTY_SCENE_WORKSPACE_STATE);
    setSelectedObjectAddress(null);
    setChildrenByParent({});
    setChildTaskByParent({});
    setLoadingChildrenByParent({});
    setChildErrorByParent({});
    setInspectorsByAddress({});
    setInspectorTaskByAddress({});
    setInspectorLoadingByAddress({});
    setInspectorErrorByAddress({});
    setSceneMutationState(EMPTY_MUTATION_STATE);
    childPollTokensRef.current = {};
    activeChildTaskIdByParentRef.current = {};
    activeInspectorTaskIdRef.current = null;
    inspectorPollTokenRef.current += 1;
  }, []);

  const applySummaryPatch = useCallback((summary: RuntimeSceneNodeSummary) => {
    setSceneWorkspace((previous) => patchRootsWithSummary(previous, summary));
    setChildrenByParent((previous) => patchChildrenWithSummary(previous, summary));
    setInspectorsByAddress((previous) => patchInspectorsWithSummary(previous, summary));
  }, []);

  const applySummaryBatch = useCallback((summaries: RuntimeSceneNodeSummary[]) => {
    if (summaries.length === 0) {
      return;
    }

    setSceneWorkspace((previous) => patchRootsWithSummaries(previous, summaries));
    setChildrenByParent((previous) => patchChildrenWithSummaries(previous, summaries));
    setInspectorsByAddress((previous) => patchInspectorsWithSummaries(previous, summaries));
  }, []);

  const applySceneChildrenTaskState = useCallback((taskState: RuntimeSceneObjectChildrenTaskState) => {
    setChildTaskByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: taskState,
    }));
    setLoadingChildrenByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: !isTerminalChildrenTaskStatus(taskState.status),
    }));
    setChildErrorByParent((previous) => ({
      ...previous,
      [taskState.parentObjectAddress]: taskState.errorMessage,
    }));

    startTransition(() => {
      applySummaryBatch(taskState.children);
      setChildrenByParent((previous) => {
        const existing = previous[taskState.parentObjectAddress] ?? [];
        if (sameNodeOrder(existing, taskState.children)) {
          return previous;
        }

        return {
          ...previous,
          [taskState.parentObjectAddress]: taskState.children,
        };
      });
    });
  }, [applySummaryBatch]);

  const applyInspectorTaskState = useCallback((taskState: RuntimeSceneObjectInspectorTaskState) => {
    setInspectorTaskByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: taskState,
    }));
    setInspectorLoadingByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: !isTerminalInspectorTaskStatus(taskState.status),
    }));
    setInspectorErrorByAddress((previous) => ({
      ...previous,
      [taskState.objectAddress]: taskState.errorMessage,
    }));

    const nextSnapshot = buildInspectorSnapshot(taskState);
    if (!nextSnapshot) {
      return;
    }

    if (nextSnapshot.parent) {
      applySummaryPatch(nextSnapshot.parent);
    }
    applySummaryPatch(nextSnapshot.object);

    startTransition(() => {
      setInspectorsByAddress((previous) => mergeInspectorCaches(previous, nextSnapshot));
      setChildrenByParent((previous) => {
        const existing = previous[taskState.objectAddress] ?? [];
        if (sameNodeOrder(existing, taskState.children)) {
          return previous;
        }

        return {
          ...previous,
          [taskState.objectAddress]: taskState.children,
        };
      });
    });
  }, [applySummaryPatch]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let disposed = false;
    let disposeWorkspace: (() => void) | undefined;
    let disposeChildren: (() => void) | undefined;
    let disposeInspector: (() => void) | undefined;

    onSceneWorkspaceStateUpdated((nextWorkspace) => {
      if (disposed) {
        return;
      }
      setSceneWorkspace(nextWorkspace);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeWorkspace = dispose;
    }).catch(() => undefined);

    onSceneObjectChildrenTaskUpdated((taskState) => {
      if (disposed) {
        return;
      }

      const activeTaskId = activeChildTaskIdByParentRef.current[taskState.parentObjectAddress];
      if (activeTaskId == null || taskState.taskId !== activeTaskId) {
        return;
      }

      applySceneChildrenTaskState(taskState);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeChildren = dispose;
    }).catch(() => undefined);

    onSceneObjectInspectorTaskUpdated((taskState) => {
      if (disposed) {
        return;
      }

      if (activeInspectorTaskIdRef.current == null || taskState.taskId !== activeInspectorTaskIdRef.current) {
        return;
      }

      applyInspectorTaskState(taskState);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      disposeInspector = dispose;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      disposeWorkspace?.();
      disposeChildren?.();
      disposeInspector?.();
    };
  }, [active, applyInspectorTaskState, applySceneChildrenTaskState]);

  const bumpParentChildCount = useCallback((objectAddress: string, delta: number) => {
    setSceneWorkspace((previous) => {
      if (!previous.snapshot) {
        return previous;
      }

      let touched = false;
      const scenes = previous.snapshot.scenes.map((scene) => {
        const roots = adjustNodeChildCountInList(scene.roots, objectAddress, delta);
        if (roots !== scene.roots) {
          touched = true;
          return { ...scene, roots };
        }
        return scene;
      });

      if (!touched) {
        return previous;
      }

      return {
        ...previous,
        snapshot: {
          ...previous.snapshot,
          scenes,
        },
      };
    });
    setChildrenByParent((previous) => adjustChildrenCounts(previous, objectAddress, delta));
    setInspectorsByAddress((previous) => adjustInspectorCounts(previous, objectAddress, delta));
  }, []);

  const loadSceneObjectInspector = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = inspectorTaskByAddressRef.current[objectAddress];
    if (!force && (currentTask && !isTerminalInspectorTaskStatus(currentTask.status))) {
      return;
    }

    const startedAt = nowMs();
    const pollToken = inspectorPollTokenRef.current + 1;
    inspectorPollTokenRef.current = pollToken;
    activeInspectorTaskIdRef.current = null;
    setInspectorLoadingByAddress((previous) => ({
      ...previous,
      [objectAddress]: true,
    }));
    setInspectorErrorByAddress((previous) => ({
      ...previous,
      [objectAddress]: null,
    }));

    try {
      let taskState = await repository.startSceneObjectInspectorAnalysis(objectAddress);
      if (inspectorPollTokenRef.current !== pollToken || !taskState) {
        return;
      }

      activeInspectorTaskIdRef.current = taskState.taskId;
      applyInspectorTaskState(taskState);

      if (taskState.header) {
        logScenePerf(`getSceneObjectInspector:${objectAddress}`, startedAt, {
          status: taskState.status,
          childCount: taskState.childrenLoadedCount,
          childTotal: taskState.childrenTotalCount,
          componentCount: taskState.componentsLoadedCount,
          componentTotal: taskState.componentsTotalCount,
        });
      }
    } catch (error) {
      const message = logSceneError(`getSceneObjectInspector failed for ${objectAddress}`, error);
      setInspectorErrorByAddress((previous) => ({
        ...previous,
        [objectAddress]: message,
      }));
    }
  }, [applyInspectorTaskState, repository]);

  const ensureSceneObjectChildrenLoaded = useCallback(async (objectAddress: string, force = false) => {
    const currentTask = childTaskByParentRef.current[objectAddress];
    if (!force && currentTask && !isTerminalChildrenTaskStatus(currentTask.status)) {
      return;
    }
    if (!force && currentTask?.status === 'ready' && currentTask.loadedCount >= currentTask.totalCount) {
      return;
    }

    const startedAt = nowMs();
    const pollToken = (childPollTokensRef.current[objectAddress] ?? 0) + 1;
    childPollTokensRef.current[objectAddress] = pollToken;
    activeChildTaskIdByParentRef.current[objectAddress] = null;
    setLoadingChildrenByParent((previous) => ({
      ...previous,
      [objectAddress]: true,
    }));
    setChildErrorByParent((previous) => ({
      ...previous,
      [objectAddress]: null,
    }));

    try {
      await waitForNextPaint();
      let taskState = await repository.startSceneObjectChildrenAnalysis(objectAddress);
      if ((childPollTokensRef.current[objectAddress] ?? 0) !== pollToken || !taskState) {
        return;
      }

      activeChildTaskIdByParentRef.current[objectAddress] = taskState.taskId;
      applySceneChildrenTaskState(taskState);

      logScenePerf(`getSceneObjectChildren:${objectAddress}`, startedAt, {
        status: taskState.status,
        loadedCount: taskState.loadedCount,
        totalCount: taskState.totalCount,
      });
    } catch (error) {
      const message = logSceneError(`getSceneObjectChildren failed for ${objectAddress}`, error);
      setChildErrorByParent((previous) => ({
        ...previous,
        [objectAddress]: message,
      }));
    }
  }, [applySceneChildrenTaskState, repository]);

  const stopSceneObjectChildrenObservation = useCallback((objectAddress: string) => {
    childPollTokensRef.current[objectAddress] = (childPollTokensRef.current[objectAddress] ?? 0) + 1;
    delete activeChildTaskIdByParentRef.current[objectAddress];
    setChildTaskByParent((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, objectAddress)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectAddress];
      return next;
    });
    setLoadingChildrenByParent((previous) => {
      if (!previous[objectAddress]) {
        return previous;
      }

      return {
        ...previous,
        [objectAddress]: false,
      };
    });
  }, []);

  const refreshSceneWorkspace = useCallback(async () => {
    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      return;
    }

    const startedAt = nowMs();
    setSceneWorkspace((previous) => ({
      ...previous,
      refreshStatus: 'refreshing',
      errorMessage: null,
    }));

    try {
      const next = await repository.startSceneRefresh();
      setSceneWorkspace(next);
      setChildrenByParent({});
      setChildTaskByParent({});
      setLoadingChildrenByParent({});
      setChildErrorByParent({});
      setInspectorsByAddress({});
      setInspectorTaskByAddress({});
      setInspectorLoadingByAddress({});
      setInspectorErrorByAddress({});
      setSceneMutationState(EMPTY_MUTATION_STATE);
      childPollTokensRef.current = {};
      activeChildTaskIdByParentRef.current = {};
      logScenePerf('refreshSceneWorkspace', startedAt, {
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
    } catch (error) {
      const message = logSceneError('refreshSceneWorkspace failed', error);
      setSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
    }
  }, [repository, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  const loadSceneWorkspaceState = useCallback(async () => {
    const startedAt = nowMs();
    try {
      const next = await repository.getSceneWorkspaceState();
      setSceneWorkspace(next);
      logScenePerf('getSceneWorkspaceState', startedAt, {
        refreshStatus: next.refreshStatus,
        sceneCount: next.snapshot?.scenes.length ?? 0,
      });
      return next;
    } catch (error) {
      const message = logSceneError('getSceneWorkspaceState failed', error);
      setSceneWorkspace((previous) => ({
        ...previous,
        refreshStatus: 'error',
        errorMessage: message,
      }));
      return null;
    }
  }, [repository]);

  const applySceneMutation = useCallback((result: RuntimeSceneMutationResult) => {
    if (result.object) {
      applySummaryPatch(result.object);
    }

    const impacted = [
      result.targetObjectAddress,
      result.parentObjectAddress,
      result.deletedObjectAddress,
      result.object?.objectAddress,
    ].filter((value): value is string => Boolean(value));

    if (impacted.length > 0) {
      setInspectorTaskByAddress((previous) => {
        let touched = false;
        const next = { ...previous };
        impacted.forEach((address) => {
          if (Object.prototype.hasOwnProperty.call(next, address)) {
            delete next[address];
            touched = true;
          }
        });
        return touched ? next : previous;
      });
    }

    const hierarchyMutation = result.operation === 'create-child'
      || result.operation === 'duplicate'
      || result.operation === 'delete';

    if (hierarchyMutation && impacted.length > 0) {
      setChildTaskByParent((previous) => {
        let touched = false;
        const next = { ...previous };
        impacted.forEach((address) => {
          if (Object.prototype.hasOwnProperty.call(next, address)) {
            delete next[address];
            touched = true;
          }
        });
        return touched ? next : previous;
      });
    }

    switch (result.operation) {
      case 'create-child': {
        if (result.parentObjectAddress && result.object) {
          bumpParentChildCount(result.parentObjectAddress, 1);
          setChildrenByParent((previous) => insertChildNode(previous, result.parentObjectAddress!, result.object));
          setInspectorsByAddress((previous) => insertChildIntoInspectors(previous, result.parentObjectAddress!, result.object));
        }
        break;
      }
      case 'create-root': {
        setSceneWorkspace((previous) => insertRootNode(previous, result.sceneHandle, result.object));
        break;
      }
      case 'duplicate': {
        if (result.parentObjectAddress && result.object) {
          bumpParentChildCount(result.parentObjectAddress, 1);
          setChildrenByParent((previous) => insertChildNode(previous, result.parentObjectAddress!, result.object));
          setInspectorsByAddress((previous) => insertChildIntoInspectors(previous, result.parentObjectAddress!, result.object));
        } else {
          setSceneWorkspace((previous) => insertRootNode(previous, result.sceneHandle, result.object));
        }
        break;
      }
      case 'delete': {
        if (result.parentObjectAddress) {
          bumpParentChildCount(result.parentObjectAddress, -1);
          setChildrenByParent((previous) => removeChildNode(previous, result.parentObjectAddress!, result.deletedObjectAddress));
        } else {
          setSceneWorkspace((previous) => removeRootNode(previous, result.sceneHandle, result.deletedObjectAddress));
        }

        setChildrenByParent((previous) => removeNodeEverywhere(previous, result.deletedObjectAddress));
        setInspectorsByAddress((previous) => removeNodeFromInspectors(previous, result.deletedObjectAddress));
        setInspectorErrorByAddress((previous) => {
          if (!result.deletedObjectAddress || !Object.prototype.hasOwnProperty.call(previous, result.deletedObjectAddress)) {
            return previous;
          }

          const next = { ...previous };
          delete next[result.deletedObjectAddress];
          return next;
        });
        setInspectorLoadingByAddress((previous) => {
          if (!result.deletedObjectAddress || !Object.prototype.hasOwnProperty.call(previous, result.deletedObjectAddress)) {
            return previous;
          }

          const next = { ...previous };
          delete next[result.deletedObjectAddress];
          return next;
        });
        break;
      }
      case 'set-active': {
        if (result.object) {
          applySummaryPatch(result.object);
        }
        break;
      }
      case 'rename':
      case 'set-tag':
      case 'set-layer':
      case 'set-hide-flags': {
        if (result.object) {
          applySummaryPatch(result.object);
        }
        break;
      }
      case 'reparent': {
        if (result.object) {
          applySummaryPatch(result.object);
        }
        break;
      }
      case 'set-transform': {
        if (result.targetObjectAddress && result.transform) {
          setInspectorsByAddress((previous) => patchInspectorTransform(previous, result.targetObjectAddress!, result.transform!));
        }
        break;
      }
      case 'set-behaviour-enabled':
      case 'add-component':
      case 'remove-component': {
        break;
      }
      case 'load-scene': {
        break;
      }
      default:
        break;
    }

    if (result.preferredSelectionAddress !== undefined) {
      setSelectedObjectAddress(result.preferredSelectionAddress);
    }
  }, [applySummaryPatch, bumpParentChildCount]);

  const runMutation = useCallback(async (
    operation: RuntimeSceneMutationOperation,
    runner: () => Promise<RuntimeSceneMutationResult>,
  ) => {
    const startedAt = nowMs();
    const taskStartedAt = new Date().toISOString();
    sceneMutationTaskCounterRef.current += 1;
    const taskId = `scene-${operation}-${sceneMutationTaskCounterRef.current}`;
    setSceneMutationState({
      operation,
      loading: true,
      errorMessage: null,
      task: {
        taskId,
        resourceKind: 'scene',
        operationKey: `scene.${operation}`,
        scope: sceneMutationTaskScope(operation),
        status: 'running',
        progress: {
          completed: 0,
          total: 1,
          message: `Applying ${operation}`,
        },
        targetId: selectedObjectAddress,
        startedAt: taskStartedAt,
        updatedAt: taskStartedAt,
        errorMessage: null,
      },
    });

    try {
      const result = await runner();
      applySceneMutation(result);
      const updatedAt = new Date().toISOString();
      setSceneMutationState({
        operation,
        loading: false,
        errorMessage: null,
        task: {
          taskId,
          resourceKind: 'scene',
          operationKey: `scene.${operation}`,
          scope: sceneMutationTaskScope(operation),
          status: 'success',
          progress: {
            completed: 1,
            total: 1,
            message: `Completed ${operation}`,
          },
          targetId: result.preferredSelectionAddress ?? result.targetObjectAddress ?? selectedObjectAddress,
          startedAt: taskStartedAt,
          updatedAt,
          errorMessage: null,
        },
      });
      logScenePerf(`sceneMutation:${operation}`, startedAt, {
        targetObjectAddress: result.targetObjectAddress,
        parentObjectAddress: result.parentObjectAddress,
      });
      return result;
    } catch (error) {
      const message = logSceneError(`scene mutation failed: ${operation}`, error);
      const updatedAt = new Date().toISOString();
      setSceneMutationState({
        operation,
        loading: false,
        errorMessage: message,
        task: {
          taskId,
          resourceKind: 'scene',
          operationKey: `scene.${operation}`,
          scope: sceneMutationTaskScope(operation),
          status: 'error',
          progress: {
            completed: 0,
            total: 1,
            message: `Failed ${operation}`,
          },
          targetId: selectedObjectAddress,
          startedAt: taskStartedAt,
          updatedAt,
          errorMessage: message,
        },
      });
      throw error;
    }
  }, [applySceneMutation, selectedObjectAddress]);

  const createSceneChild = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('create-child', () => repository.createSceneChild(selectedObjectAddress, name));
  }, [repository, runMutation, selectedObjectAddress]);

  const createSceneRoot = useCallback(async (sceneHandle: number, name: string) => {
    return runMutation('create-root', () => repository.createSceneRoot(sceneHandle, name));
  }, [repository, runMutation]);

  const duplicateSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('duplicate', () => repository.duplicateSceneObject(selectedObjectAddress));
  }, [repository, runMutation, selectedObjectAddress]);

  const deleteSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('delete', () => repository.deleteSceneObject(selectedObjectAddress));
  }, [repository, runMutation, selectedObjectAddress]);

  const renameSceneObject = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('rename', () => repository.renameSceneObject(selectedObjectAddress, name));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTag = useCallback(async (tag: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('set-tag', () => repository.setSceneObjectTag(selectedObjectAddress, tag));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectLayer = useCallback(async (layer: number) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('set-layer', () => repository.setSceneObjectLayer(selectedObjectAddress, layer));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectHideFlags = useCallback(async (hideFlags: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('set-hide-flags', () => repository.setSceneObjectHideFlags(selectedObjectAddress, hideFlags));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const reparentSceneObject = useCallback(async (parentObjectAddress?: string | null, parentPath?: string | null) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('reparent', () => repository.reparentSceneObject({
      objectAddress: selectedObjectAddress,
      parentObjectAddress,
      parentPath,
    }));
    await refreshSceneWorkspace();
    if (result.preferredSelectionAddress !== undefined) {
      setSelectedObjectAddress(result.preferredSelectionAddress);
    }
    if (result.preferredSelectionAddress) {
      loadSceneObjectInspector(result.preferredSelectionAddress, true).catch(() => undefined);
    }
    return result;
  }, [loadSceneObjectInspector, refreshSceneWorkspace, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectActive = useCallback(async (activeSelf: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-active', () => repository.setSceneObjectActive(selectedObjectAddress, activeSelf));
  }, [repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTransform = useCallback(async (transformUpdate: RuntimeSceneTransformUpdate) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('set-transform', () => repository.setSceneObjectTransform(selectedObjectAddress, transformUpdate));
    if (selectedObjectAddress) {
      loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    }
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const setSceneBehaviourEnabled = useCallback(async (componentAddress: string, enabled: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('set-behaviour-enabled', () => repository.setSceneBehaviourEnabled(componentAddress, enabled));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const createSceneComponent = useCallback(async (componentTypeName: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('add-component', () => repository.createSceneComponent(selectedObjectAddress, componentTypeName));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const deleteSceneComponent = useCallback(async (componentAddress: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    const result = await runMutation('remove-component', () => repository.deleteSceneComponent(componentAddress));
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
    return result;
  }, [loadSceneObjectInspector, repository, runMutation, selectedObjectAddress]);

  const loadSceneByBuildIndex = useCallback(async (buildIndex: number) => {
    const result = await runMutation('load-scene', () => repository.loadSceneByBuildIndex(buildIndex));
    await refreshSceneWorkspace();
    if (result.preferredSelectionAddress !== undefined) {
      setSelectedObjectAddress(result.preferredSelectionAddress);
    }
    return result;
  }, [refreshSceneWorkspace, repository, runMutation]);

  useEffect(() => {
    const processKey = workspaceLifecycle.processSession
      ? `${workspaceLifecycle.processSession.pid}:${workspaceLifecycle.processSession.processName}`
      : null;

    if (processKeyRef.current !== processKey) {
      processKeyRef.current = processKey;
      resetSceneState();
    }
  }, [resetSceneState, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot) {
      resetSceneState();
      return;
    }

    loadSceneWorkspaceState().then((state) => {
      if (!state?.snapshot) {
        refreshSceneWorkspace().catch(() => undefined);
      }
    }).catch(() => undefined);
  }, [active, loadSceneWorkspaceState, refreshSceneWorkspace, resetSceneState, workspaceLifecycle.hasSnapshot, workspaceLifecycle.processSession]);

  useEffect(() => {
    if (!selectedObjectAddress || !active) {
      return;
    }

    loadSceneObjectInspector(selectedObjectAddress).catch(() => undefined);
    return () => {
      inspectorPollTokenRef.current += 1;
      const activeTaskId = activeInspectorTaskIdRef.current;
      activeInspectorTaskIdRef.current = null;
      if (activeTaskId != null) {
        repository.cancelSceneObjectInspectorAnalysis(activeTaskId).catch(() => undefined);
      }
    };
  }, [active, loadSceneObjectInspector, repository, selectedObjectAddress]);

  const sceneInspector = useMemo(() => {
    return selectedObjectAddress ? inspectorsByAddress[selectedObjectAddress] ?? null : null;
  }, [inspectorsByAddress, selectedObjectAddress]);

  const sceneInspectorTaskState = useMemo(() => {
    return selectedObjectAddress ? inspectorTaskByAddress[selectedObjectAddress] ?? null : null;
  }, [inspectorTaskByAddress, selectedObjectAddress]);

  const sceneInspectorLoading = selectedObjectAddress ? inspectorLoadingByAddress[selectedObjectAddress] ?? false : false;
  const sceneInspectorError = selectedObjectAddress ? inspectorErrorByAddress[selectedObjectAddress] ?? null : null;
  const sceneInspectorChildrenLoading = sceneInspectorTaskState != null
    && (sceneInspectorTaskState.status === 'children-loading'
      || (sceneInspectorTaskState.status === 'components-loading'
        && sceneInspectorTaskState.childrenLoadedCount < sceneInspectorTaskState.childrenTotalCount));
  const sceneInspectorComponentsLoading = sceneInspectorTaskState != null
    && (sceneInspectorTaskState.status === 'components-loading'
      || (sceneInspectorTaskState.status === 'children-loading' && sceneInspectorTaskState.componentsTotalCount > 0));

  const sceneRootsByHandle = useMemo(() => {
    return Object.fromEntries((sceneWorkspace.snapshot?.scenes ?? []).map((scene) => [scene.sceneHandle, scene.roots]));
  }, [sceneWorkspace.snapshot]);

  const sceneTasks = useMemo(() => {
    return collectSceneWorkspaceTasks({
      sceneWorkspace,
      childTaskByParent,
      inspectorTaskByAddress,
      mutationTask: sceneMutationState.task,
    });
  }, [childTaskByParent, inspectorTaskByAddress, sceneMutationState.task, sceneWorkspace]);

  return {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    childrenByParent,
    childTaskByParent,
    loadingChildrenByParent,
    childErrorByParent,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    createSceneRoot,
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    renameSceneObject,
    setSceneObjectTag,
    setSceneObjectLayer,
    setSceneObjectHideFlags,
    reparentSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    setSceneBehaviourEnabled,
    createSceneComponent,
    deleteSceneComponent,
    loadSceneByBuildIndex,
    sceneMutationState,
    activeSceneTask: sceneMutationState.task,
    sceneTasks,
    sceneRootsByHandle,
  };
}