import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  RuntimeSceneMutationOperation,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceTaskScope } from '@/shared/contracts';
import {
  insertChildIntoInspectors,
  insertChildNode,
  insertRootNode,
  logSceneError,
  logScenePerf,
  patchInspectorTransform,
  removeChildNode,
  removeNodeEverywhere,
  removeNodeFromInspectors,
  removeRootNode,
} from './sceneWorkspaceStatePatches';
import type { SceneMutationState } from './useSceneWorkspaceStore';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sceneMutationTaskScope(operation: RuntimeSceneMutationOperation): WorkspaceTaskScope {
  return operation === 'load-scene' || operation === 'create-root' ? 'resource' : 'selection';
}

interface UseSceneMutationActionsOptions {
  repository: SceneGateway;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
  refreshSceneWorkspace: () => Promise<void>;
  loadSceneObjectInspector: (objectAddress: string, force?: boolean) => Promise<void>;
  setSceneWorkspace: Dispatch<SetStateAction<SceneWorkspaceState>>;
  setChildrenByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneNodeSummary[]>>>;
  setChildTaskByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectChildrenTaskState>>>;
  setInspectorsByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectInspectorSnapshot>>>;
  setInspectorTaskByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectInspectorTaskState>>>;
  setInspectorErrorByAddress: Dispatch<SetStateAction<Record<string, string | null>>>;
  setInspectorLoadingByAddress: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSceneMutationState: Dispatch<SetStateAction<SceneMutationState>>;
  sceneMutationTaskCounterRef: MutableRefObject<number>;
  applySummaryPatch: (summary: RuntimeSceneNodeSummary) => void;
  bumpParentChildCount: (objectAddress: string, delta: number) => void;
}

export function useSceneMutationActions({
  repository,
  selectedObjectAddress,
  setSelectedObjectAddress,
  refreshSceneWorkspace,
  loadSceneObjectInspector,
  setSceneWorkspace,
  setChildrenByParent,
  setChildTaskByParent,
  setInspectorsByAddress,
  setInspectorTaskByAddress,
  setInspectorErrorByAddress,
  setInspectorLoadingByAddress,
  setSceneMutationState,
  sceneMutationTaskCounterRef,
  applySummaryPatch,
  bumpParentChildCount,
}: UseSceneMutationActionsOptions) {
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
      case 'set-active':
      case 'rename':
      case 'set-tag':
      case 'set-layer':
      case 'set-hide-flags':
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
      case 'remove-component':
      case 'load-scene': {
        break;
      }
      default:
        break;
    }

    if (result.preferredSelectionAddress !== undefined) {
      setSelectedObjectAddress(result.preferredSelectionAddress);
    }
  }, [applySummaryPatch, bumpParentChildCount, setChildTaskByParent, setChildrenByParent, setInspectorErrorByAddress, setInspectorLoadingByAddress, setInspectorTaskByAddress, setInspectorsByAddress, setSceneWorkspace, setSelectedObjectAddress]);

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
  }, [applySceneMutation, sceneMutationTaskCounterRef, selectedObjectAddress, setSceneMutationState]);

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
  }, [loadSceneObjectInspector, refreshSceneWorkspace, repository, runMutation, selectedObjectAddress, setSelectedObjectAddress]);

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
    loadSceneObjectInspector(selectedObjectAddress, true).catch(() => undefined);
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
  }, [refreshSceneWorkspace, repository, runMutation, setSelectedObjectAddress]);

  return {
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
  };
}