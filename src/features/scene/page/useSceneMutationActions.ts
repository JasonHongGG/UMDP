import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  RuntimeSceneMutationOperation,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneObjectInspectorSnapshot,
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
import type { SceneMutationState, SceneObjectActiveIntentState } from './useSceneWorkspaceStore';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sceneMutationTaskScope(operation: RuntimeSceneMutationOperation): WorkspaceTaskScope {
  return operation === 'load-scene' || operation === 'create-root' ? 'resource' : 'selection';
}

function incrementPendingOperations(
  pendingOperations: SceneMutationState['pendingOperations'],
  operation: RuntimeSceneMutationOperation,
) {
  return {
    ...pendingOperations,
    [operation]: (pendingOperations[operation] ?? 0) + 1,
  };
}

function decrementPendingOperations(
  pendingOperations: SceneMutationState['pendingOperations'],
  operation: RuntimeSceneMutationOperation,
) {
  const nextCount = Math.max(0, (pendingOperations[operation] ?? 0) - 1);
  if (nextCount > 0) {
    return {
      ...pendingOperations,
      [operation]: nextCount,
    };
  }

  const next = { ...pendingOperations };
  delete next[operation];
  return next;
}

function hasPendingOperations(pendingOperations: SceneMutationState['pendingOperations']) {
  return Object.values(pendingOperations).some((count) => count > 0);
}

type SceneQueuedMutation = {
  queueId: number;
  operation: RuntimeSceneMutationOperation;
  targetObjectAddress: string | null;
  run: () => Promise<RuntimeSceneMutationResult>;
  afterSuccess?: (result: RuntimeSceneMutationResult) => Promise<void> | void;
  activeIntent?: {
    objectAddress: string;
    desiredActiveSelf: boolean;
  };
  resolve: (result: RuntimeSceneMutationResult | null) => void;
  reject: (error: unknown) => void;
};

type RunSceneMutationOptions = {
  targetObjectAddress?: string | null;
  afterSuccess?: (result: RuntimeSceneMutationResult) => Promise<void> | void;
  activeIntent?: {
    objectAddress: string;
    desiredActiveSelf: boolean;
  };
};

function findLastQueuedMutationIndex(
  queue: SceneQueuedMutation[],
  predicate: (entry: SceneQueuedMutation) => boolean,
) {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (predicate(queue[index])) {
      return index;
    }
  }

  return -1;
}

function updateActiveIntentState(
  activeIntentByObject: SceneMutationState['activeIntentByObject'],
  objectAddress: string,
  desiredActiveSelf: boolean,
  status: SceneObjectActiveIntentState['status'],
) {
  const current = activeIntentByObject[objectAddress];
  if (current
    && current.desiredActiveSelf === desiredActiveSelf
    && current.status === status) {
    return activeIntentByObject;
  }

  return {
    ...activeIntentByObject,
    [objectAddress]: {
      desiredActiveSelf,
      status,
    },
  };
}

function clearActiveIntentState(
  activeIntentByObject: SceneMutationState['activeIntentByObject'],
  objectAddress: string,
) {
  if (!Object.prototype.hasOwnProperty.call(activeIntentByObject, objectAddress)) {
    return activeIntentByObject;
  }

  const next = { ...activeIntentByObject };
  delete next[objectAddress];
  return next;
}

function reconcileActiveIntentAfterCompletion(
  activeIntentByObject: SceneMutationState['activeIntentByObject'],
  queue: SceneQueuedMutation[],
  completedEntry: SceneQueuedMutation,
) {
  if (!completedEntry.activeIntent) {
    return activeIntentByObject;
  }

  const replacementIndex = findLastQueuedMutationIndex(queue, (entry) => {
    return entry.activeIntent?.objectAddress === completedEntry.activeIntent?.objectAddress;
  });
  if (replacementIndex >= 0) {
    const replacement = queue[replacementIndex].activeIntent;
    if (!replacement) {
      return activeIntentByObject;
    }

    return updateActiveIntentState(
      activeIntentByObject,
      replacement.objectAddress,
      replacement.desiredActiveSelf,
      'queued',
    );
  }

  return clearActiveIntentState(activeIntentByObject, completedEntry.activeIntent.objectAddress);
}

function normalizeMutationResultObject(result: RuntimeSceneMutationResult) {
  if (!result.object) {
    return null;
  }

  if (result.activeSelf == null || result.object.activeSelf === result.activeSelf) {
    return result.object;
  }

  return {
    ...result.object,
    activeSelf: result.activeSelf,
  };
}

function markChildrenTaskStale(task: RuntimeSceneObjectChildrenTaskState): RuntimeSceneObjectChildrenTaskState {
  const hasRetainedSnapshot = task.children.length > 0;
  const resourceRevision = task.resourceRevision + 1;
  return {
    ...task,
    resourceRevision,
    status: hasRetainedSnapshot ? 'ready' : 'cancelled',
    isStale: true,
    updatedAt: new Date().toISOString(),
    resourceState: {
      ...task.resourceState,
      resourceRevision,
      freshness: hasRetainedSnapshot ? 'stale' : 'empty',
      isRetainingSnapshot: hasRetainedSnapshot,
    },
  };
}

function markHeaderTaskStale(task: RuntimeSceneObjectHeaderTaskState): RuntimeSceneObjectHeaderTaskState {
  const hasRetainedSnapshot = task.header != null;
  const resourceRevision = task.resourceRevision + 1;
  return {
    ...task,
    resourceRevision,
    status: hasRetainedSnapshot ? 'ready' : 'cancelled',
    isStale: true,
    updatedAt: new Date().toISOString(),
    resourceState: {
      ...task.resourceState,
      resourceRevision,
      freshness: hasRetainedSnapshot ? 'stale' : 'empty',
      isRetainingSnapshot: hasRetainedSnapshot,
    },
  };
}

function markComponentsTaskStale(task: RuntimeSceneObjectComponentsTaskState): RuntimeSceneObjectComponentsTaskState {
  const hasRetainedSnapshot = task.components.length > 0 || task.totalCount === 0;
  const resourceRevision = task.resourceRevision + 1;
  return {
    ...task,
    resourceRevision,
    status: hasRetainedSnapshot ? 'ready' : 'cancelled',
    isStale: true,
    updatedAt: new Date().toISOString(),
    resourceState: {
      ...task.resourceState,
      resourceRevision,
      freshness: hasRetainedSnapshot ? 'stale' : 'empty',
      isRetainingSnapshot: hasRetainedSnapshot,
    },
  };
}

interface UseSceneMutationActionsOptions {
  repository: SceneGateway;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
  refreshSceneWorkspace: () => Promise<void>;
  loadSceneObjectResources: (objectAddress: string, force?: boolean) => Promise<void>;
  setSceneWorkspace: Dispatch<SetStateAction<SceneWorkspaceState>>;
  setChildrenByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneNodeSummary[]>>>;
  setChildTaskByParent: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectChildrenTaskState>>>;
  setInspectorsByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectInspectorSnapshot>>>;
  setHeaderTaskByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectHeaderTaskState>>>;
  setHeaderErrorByAddress: Dispatch<SetStateAction<Record<string, string | null>>>;
  setHeaderLoadingByAddress: Dispatch<SetStateAction<Record<string, boolean>>>;
  setComponentsTaskByAddress: Dispatch<SetStateAction<Record<string, RuntimeSceneObjectComponentsTaskState>>>;
  setComponentsErrorByAddress: Dispatch<SetStateAction<Record<string, string | null>>>;
  setComponentsLoadingByAddress: Dispatch<SetStateAction<Record<string, boolean>>>;
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
  loadSceneObjectResources,
  setSceneWorkspace,
  setChildrenByParent,
  setChildTaskByParent,
  setInspectorsByAddress,
  setHeaderTaskByAddress,
  setHeaderErrorByAddress,
  setHeaderLoadingByAddress,
  setComponentsTaskByAddress,
  setComponentsErrorByAddress,
  setComponentsLoadingByAddress,
  setSceneMutationState,
  sceneMutationTaskCounterRef,
  applySummaryPatch,
  bumpParentChildCount,
}: UseSceneMutationActionsOptions) {
  const mutationQueueRef = useRef<SceneQueuedMutation[]>([]);
  const currentMutationRef = useRef<SceneQueuedMutation | null>(null);
  const processingMutationQueueRef = useRef(false);

  const applySceneMutation = useCallback((result: RuntimeSceneMutationResult) => {
    const normalizedObject = normalizeMutationResultObject(result);

    if (normalizedObject) {
      applySummaryPatch(normalizedObject);
    }

    const impacted = [
      result.targetObjectAddress,
      result.parentObjectAddress,
      result.deletedObjectAddress,
      normalizedObject?.objectAddress,
    ].filter((value): value is string => Boolean(value));

    if (impacted.length > 0) {
      setHeaderTaskByAddress((previous) => {
        let touched = false;
        const next = { ...previous };
        impacted.forEach((address) => {
          const task = next[address];
          if (task) {
            next[address] = markHeaderTaskStale(task);
            touched = true;
          }
        });
        if (result.deletedObjectAddress && Object.prototype.hasOwnProperty.call(next, result.deletedObjectAddress)) {
          delete next[result.deletedObjectAddress];
          touched = true;
        }
        return touched ? next : previous;
      });

      setComponentsTaskByAddress((previous) => {
        let touched = false;
        const next = { ...previous };
        impacted.forEach((address) => {
          const task = next[address];
          if (task) {
            next[address] = markComponentsTaskStale(task);
            touched = true;
          }
        });
        if (result.deletedObjectAddress && Object.prototype.hasOwnProperty.call(next, result.deletedObjectAddress)) {
          delete next[result.deletedObjectAddress];
          touched = true;
        }
        return touched ? next : previous;
      });
    }

    const hierarchyMutation = result.operation === 'create-child'
      || result.operation === 'duplicate'
      || result.operation === 'delete'
      || result.operation === 'reparent';

    if (hierarchyMutation && impacted.length > 0) {
      setChildTaskByParent((previous) => {
        let touched = false;
        const next = { ...previous };
        impacted.forEach((address) => {
          const task = next[address];
          if (task) {
            next[address] = markChildrenTaskStale(task);
            touched = true;
          }
        });
        if (result.deletedObjectAddress && Object.prototype.hasOwnProperty.call(next, result.deletedObjectAddress)) {
          delete next[result.deletedObjectAddress];
          touched = true;
        }
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
        setHeaderErrorByAddress((previous) => {
          if (!result.deletedObjectAddress || !Object.prototype.hasOwnProperty.call(previous, result.deletedObjectAddress)) {
            return previous;
          }

          const next = { ...previous };
          delete next[result.deletedObjectAddress];
          return next;
        });
        setHeaderLoadingByAddress((previous) => {
          if (!result.deletedObjectAddress || !Object.prototype.hasOwnProperty.call(previous, result.deletedObjectAddress)) {
            return previous;
          }

          const next = { ...previous };
          delete next[result.deletedObjectAddress];
          return next;
        });
        setComponentsErrorByAddress((previous) => {
          if (!result.deletedObjectAddress || !Object.prototype.hasOwnProperty.call(previous, result.deletedObjectAddress)) {
            return previous;
          }

          const next = { ...previous };
          delete next[result.deletedObjectAddress];
          return next;
        });
        setComponentsLoadingByAddress((previous) => {
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
      {
        if (result.object) {
          applySummaryPatch(result.object);
        }
        break;
      }
      case 'reparent': {
        if (normalizedObject) {
          applySummaryPatch(normalizedObject);
          setChildrenByParent((previous) => {
            const withoutObject = removeNodeEverywhere(previous, normalizedObject.objectAddress);
            if (!result.parentObjectAddress) {
              return withoutObject;
            }
            return insertChildNode(withoutObject, result.parentObjectAddress, normalizedObject);
          });
          setInspectorsByAddress((previous) => {
            const withoutObject = removeNodeFromInspectors(previous, normalizedObject.objectAddress);
            if (!result.parentObjectAddress) {
              return withoutObject;
            }
            return insertChildIntoInspectors(withoutObject, result.parentObjectAddress, normalizedObject);
          });
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
  }, [applySummaryPatch, bumpParentChildCount, setChildTaskByParent, setChildrenByParent, setComponentsErrorByAddress, setComponentsLoadingByAddress, setComponentsTaskByAddress, setHeaderErrorByAddress, setHeaderLoadingByAddress, setHeaderTaskByAddress, setInspectorsByAddress, setSceneWorkspace, setSelectedObjectAddress]);

  const processMutationQueue = useCallback(async () => {
    if (processingMutationQueueRef.current) {
      return;
    }

    processingMutationQueueRef.current = true;
    try {
      while (mutationQueueRef.current.length > 0) {
        const entry = mutationQueueRef.current.shift();
        if (!entry) {
          continue;
        }

        currentMutationRef.current = entry;
        const startedAt = nowMs();
        const taskStartedAt = new Date().toISOString();
        const taskId = `scene-${entry.operation}-${entry.queueId}`;

        setSceneMutationState((previous) => ({
          ...previous,
          operation: entry.operation,
          loading: true,
          errorMessage: null,
          task: {
            taskId,
            resourceKind: 'scene',
            operationKey: `scene.${entry.operation}`,
            scope: sceneMutationTaskScope(entry.operation),
            status: 'running',
            progress: {
              completed: 0,
              total: 1,
              message: `Applying ${entry.operation}`,
            },
            targetId: entry.targetObjectAddress,
            startedAt: taskStartedAt,
            updatedAt: taskStartedAt,
            errorMessage: null,
          },
          activeIntentByObject: entry.activeIntent
            ? updateActiveIntentState(
              previous.activeIntentByObject,
              entry.activeIntent.objectAddress,
              entry.activeIntent.desiredActiveSelf,
              'running',
            )
            : previous.activeIntentByObject,
        }));

        try {
          const result = await entry.run();
          applySceneMutation(result);
          await entry.afterSuccess?.(result);

          const updatedAt = new Date().toISOString();
          setSceneMutationState((previous) => {
            const pendingOperations = decrementPendingOperations(previous.pendingOperations, entry.operation);
            return {
              ...previous,
              operation: hasPendingOperations(pendingOperations) ? entry.operation : null,
              loading: hasPendingOperations(pendingOperations),
              errorMessage: null,
              pendingOperations,
              task: {
                taskId,
                resourceKind: 'scene',
                operationKey: `scene.${entry.operation}`,
                scope: sceneMutationTaskScope(entry.operation),
                status: 'success',
                progress: {
                  completed: 1,
                  total: 1,
                  message: `Completed ${entry.operation}`,
                },
                targetId: result.preferredSelectionAddress ?? result.targetObjectAddress ?? entry.targetObjectAddress,
                startedAt: taskStartedAt,
                updatedAt,
                errorMessage: null,
              },
              activeIntentByObject: reconcileActiveIntentAfterCompletion(
                previous.activeIntentByObject,
                mutationQueueRef.current,
                entry,
              ),
            };
          });

          logScenePerf(`sceneMutation:${entry.operation}`, startedAt, {
            targetObjectAddress: result.targetObjectAddress,
            parentObjectAddress: result.parentObjectAddress,
          });
          entry.resolve(result);
        } catch (error) {
          const message = logSceneError(`scene mutation failed: ${entry.operation}`, error);
          const updatedAt = new Date().toISOString();
          setSceneMutationState((previous) => {
            const pendingOperations = decrementPendingOperations(previous.pendingOperations, entry.operation);
            return {
              ...previous,
              operation: hasPendingOperations(pendingOperations) ? entry.operation : null,
              loading: hasPendingOperations(pendingOperations),
              errorMessage: message,
              pendingOperations,
              task: {
                taskId,
                resourceKind: 'scene',
                operationKey: `scene.${entry.operation}`,
                scope: sceneMutationTaskScope(entry.operation),
                status: 'error',
                progress: {
                  completed: 0,
                  total: 1,
                  message: `Failed ${entry.operation}`,
                },
                targetId: entry.targetObjectAddress,
                startedAt: taskStartedAt,
                updatedAt,
                errorMessage: message,
              },
              activeIntentByObject: reconcileActiveIntentAfterCompletion(
                previous.activeIntentByObject,
                mutationQueueRef.current,
                entry,
              ),
            };
          });
          entry.reject(error);
        }
      }
    } finally {
      currentMutationRef.current = null;
      processingMutationQueueRef.current = false;
    }
  }, [applySceneMutation, setSceneMutationState]);

  const runMutation = useCallback(async (
    operation: RuntimeSceneMutationOperation,
    runner: () => Promise<RuntimeSceneMutationResult>,
    options: RunSceneMutationOptions = {},
  ) => {
    return new Promise<RuntimeSceneMutationResult | null>((resolve, reject) => {
      sceneMutationTaskCounterRef.current += 1;
      const entry: SceneQueuedMutation = {
        queueId: sceneMutationTaskCounterRef.current,
        operation,
        targetObjectAddress: options.targetObjectAddress ?? null,
        run: runner,
        afterSuccess: options.afterSuccess,
        activeIntent: options.activeIntent,
        resolve,
        reject,
      };

      let replacedQueuedEntry: SceneQueuedMutation | null = null;
      if (entry.activeIntent) {
        const replacementIndex = findLastQueuedMutationIndex(mutationQueueRef.current, (candidate) => {
          return candidate.operation === operation
            && candidate.activeIntent?.objectAddress === entry.activeIntent?.objectAddress;
        });
        if (replacementIndex >= 0) {
          replacedQueuedEntry = mutationQueueRef.current[replacementIndex];
          mutationQueueRef.current[replacementIndex] = entry;
        } else {
          mutationQueueRef.current.push(entry);
        }
      } else {
        mutationQueueRef.current.push(entry);
      }

      if (replacedQueuedEntry) {
        replacedQueuedEntry.resolve(null);
      }

      setSceneMutationState((previous) => ({
        ...previous,
        loading: true,
        errorMessage: null,
        pendingOperations: replacedQueuedEntry
          ? previous.pendingOperations
          : incrementPendingOperations(previous.pendingOperations, operation),
        activeIntentByObject: entry.activeIntent
          ? updateActiveIntentState(
            previous.activeIntentByObject,
            entry.activeIntent.objectAddress,
            entry.activeIntent.desiredActiveSelf,
            'queued',
          )
          : previous.activeIntentByObject,
      }));

      processMutationQueue().catch(() => undefined);
    });
  }, [processMutationQueue, sceneMutationTaskCounterRef, setSceneMutationState]);

  const createSceneChild = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('create-child', () => repository.createSceneChild(selectedObjectAddress, name), {
      targetObjectAddress: selectedObjectAddress,
    });
  }, [repository, runMutation, selectedObjectAddress]);

  const createSceneRoot = useCallback(async (sceneHandle: number, name: string) => {
    return runMutation('create-root', () => repository.createSceneRoot(sceneHandle, name));
  }, [repository, runMutation]);

  const duplicateSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('duplicate', () => repository.duplicateSceneObject(selectedObjectAddress), {
      targetObjectAddress: selectedObjectAddress,
    });
  }, [repository, runMutation, selectedObjectAddress]);

  const deleteSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('delete', () => repository.deleteSceneObject(selectedObjectAddress), {
      targetObjectAddress: selectedObjectAddress,
    });
  }, [repository, runMutation, selectedObjectAddress]);

  const renameSceneObject = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('rename', () => repository.renameSceneObject(selectedObjectAddress, name), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTag = useCallback(async (tag: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-tag', () => repository.setSceneObjectTag(selectedObjectAddress, tag), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectLayer = useCallback(async (layer: number) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-layer', () => repository.setSceneObjectLayer(selectedObjectAddress, layer), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectHideFlags = useCallback(async (hideFlags: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-hide-flags', () => repository.setSceneObjectHideFlags(selectedObjectAddress, hideFlags), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const reparentSceneObject = useCallback(async (parentObjectAddress?: string | null, parentPath?: string | null) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('reparent', () => repository.reparentSceneObject({
      objectAddress: selectedObjectAddress,
      parentObjectAddress,
      parentPath,
    }), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: async (result) => {
        await refreshSceneWorkspace();
        if (result.preferredSelectionAddress) {
          loadSceneObjectResources(result.preferredSelectionAddress, true).catch(() => undefined);
        }
      },
    });
  }, [loadSceneObjectResources, refreshSceneWorkspace, repository, runMutation, selectedObjectAddress, setSelectedObjectAddress]);

  const setSceneObjectActive = useCallback(async (activeSelf: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-active', () => repository.setSceneObjectActive(selectedObjectAddress, activeSelf), {
      targetObjectAddress: selectedObjectAddress,
      activeIntent: {
        objectAddress: selectedObjectAddress,
        desiredActiveSelf: activeSelf,
      },
    });
  }, [repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTransform = useCallback(async (transformUpdate: RuntimeSceneTransformUpdate) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-transform', () => repository.setSceneObjectTransform(selectedObjectAddress, transformUpdate), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneBehaviourEnabled = useCallback(async (componentAddress: string, enabled: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-behaviour-enabled', () => repository.setSceneBehaviourEnabled(componentAddress, enabled), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const createSceneComponent = useCallback(async (componentTypeName: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('add-component', () => repository.createSceneComponent(selectedObjectAddress, componentTypeName), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const deleteSceneComponent = useCallback(async (componentAddress: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('remove-component', () => repository.deleteSceneComponent(componentAddress), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => {
        loadSceneObjectResources(selectedObjectAddress, true).catch(() => undefined);
      },
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const loadSceneByBuildIndex = useCallback(async (buildIndex: number) => {
    return runMutation('load-scene', () => repository.loadSceneByBuildIndex(buildIndex), {
      afterSuccess: async () => {
        await refreshSceneWorkspace();
      },
    });
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