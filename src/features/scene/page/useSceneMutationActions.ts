import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  RuntimeSceneMutationOperation,
  RuntimeSceneMutationResult,
  RuntimeSceneTransformUpdate,
} from '@/domain/analysis/contracts';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceTaskScope } from '@/shared/contracts';
import { logSceneError, logScenePerf } from './sceneWorkspaceStatePatches';
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

interface UseSceneMutationActionsOptions {
  repository: SceneGateway;
  selectedObjectAddress: string | null;
  setSelectedObjectAddress: (value: string | null) => void;
  refreshSceneWorkspace: () => Promise<void>;
  loadSceneObjectResources: (objectAddress: string, force?: boolean) => Promise<void>;
  setSceneMutationState: Dispatch<SetStateAction<SceneMutationState>>;
  sceneMutationTaskCounterRef: MutableRefObject<number>;
}

export function useSceneMutationActions({
  repository,
  selectedObjectAddress,
  setSelectedObjectAddress,
  refreshSceneWorkspace,
  loadSceneObjectResources,
  setSceneMutationState,
  sceneMutationTaskCounterRef,
}: UseSceneMutationActionsOptions) {
  const mutationQueueRef = useRef<SceneQueuedMutation[]>([]);
  const currentMutationRef = useRef<SceneQueuedMutation | null>(null);
  const processingMutationQueueRef = useRef(false);

  const applySceneMutation = useCallback((result: RuntimeSceneMutationResult) => {
    const normalizedObject = normalizeMutationResultObject(result);
    if (result.operation === 'load-scene') {
      setSceneMutationState((previous) => ({
        ...previous,
        activeOverrideByObject: {},
      }));
    } else if (result.operation === 'set-active' && normalizedObject) {
      setSceneMutationState((previous) => ({
        ...previous,
        activeOverrideByObject: {
          ...previous.activeOverrideByObject,
          [normalizedObject.objectAddress]: normalizedObject.activeSelf,
        },
      }));
    } else if (result.deletedObjectAddress) {
      setSceneMutationState((previous) => {
        if (!Object.prototype.hasOwnProperty.call(previous.activeOverrideByObject, result.deletedObjectAddress!)) {
          return previous;
        }

        const nextActiveOverrideByObject = { ...previous.activeOverrideByObject };
        delete nextActiveOverrideByObject[result.deletedObjectAddress!];
        return {
          ...previous,
          activeOverrideByObject: nextActiveOverrideByObject,
        };
      });
    }

    if (result.preferredSelectionAddress !== undefined) {
      setSelectedObjectAddress(result.preferredSelectionAddress);
    }
  }, [setSceneMutationState, setSelectedObjectAddress]);

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

  const refreshAndReload = useCallback(async (addresses: Array<string | null | undefined>) => {
    await refreshSceneWorkspace();
    const uniqueAddresses = Array.from(new Set(addresses.filter((value): value is string => Boolean(value))));
    await Promise.all(uniqueAddresses.map((address) => loadSceneObjectResources(address, true)));
  }, [loadSceneObjectResources, refreshSceneWorkspace]);

  const createSceneChild = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('create-child', () => repository.createSceneChild(selectedObjectAddress, name), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: async (result) => {
        await refreshAndReload([
          result.parentObjectAddress,
          result.preferredSelectionAddress,
          result.targetObjectAddress,
        ]);
      },
    });
  }, [refreshAndReload, repository, runMutation, selectedObjectAddress]);

  const createSceneRoot = useCallback(async (sceneHandle: number, name: string) => {
    return runMutation('create-root', () => repository.createSceneRoot(sceneHandle, name), {
      afterSuccess: async (result) => {
        await refreshAndReload([result.preferredSelectionAddress, result.targetObjectAddress]);
      },
    });
  }, [refreshAndReload, repository, runMutation]);

  const duplicateSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('duplicate', () => repository.duplicateSceneObject(selectedObjectAddress), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: async (result) => {
        await refreshAndReload([
          result.parentObjectAddress,
          result.preferredSelectionAddress,
          result.targetObjectAddress,
        ]);
      },
    });
  }, [refreshAndReload, repository, runMutation, selectedObjectAddress]);

  const deleteSceneObject = useCallback(async () => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('delete', () => repository.deleteSceneObject(selectedObjectAddress), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: async (result) => {
        await refreshAndReload([result.parentObjectAddress, result.preferredSelectionAddress]);
      },
    });
  }, [refreshAndReload, repository, runMutation, selectedObjectAddress]);

  const renameSceneObject = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('rename', () => repository.renameSceneObject(selectedObjectAddress, name), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTag = useCallback(async (tag: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-tag', () => repository.setSceneObjectTag(selectedObjectAddress, tag), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectLayer = useCallback(async (layer: number) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-layer', () => repository.setSceneObjectLayer(selectedObjectAddress, layer), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectHideFlags = useCallback(async (hideFlags: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-hide-flags', () => repository.setSceneObjectHideFlags(selectedObjectAddress, hideFlags), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
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
        await refreshAndReload([
          result.parentObjectAddress,
          result.preferredSelectionAddress,
          result.targetObjectAddress,
        ]);
      },
    });
  }, [refreshAndReload, repository, runMutation, selectedObjectAddress]);

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
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneObjectTransform = useCallback(async (transformUpdate: RuntimeSceneTransformUpdate) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-transform', () => repository.setSceneObjectTransform(selectedObjectAddress, transformUpdate), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const setSceneBehaviourEnabled = useCallback(async (componentAddress: string, enabled: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-behaviour-enabled', () => repository.setSceneBehaviourEnabled(componentAddress, enabled), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const createSceneComponent = useCallback(async (componentTypeName: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('add-component', () => repository.createSceneComponent(selectedObjectAddress, componentTypeName), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const deleteSceneComponent = useCallback(async (componentAddress: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('remove-component', () => repository.deleteSceneComponent(componentAddress), {
      targetObjectAddress: selectedObjectAddress,
      afterSuccess: () => loadSceneObjectResources(selectedObjectAddress, true),
    });
  }, [loadSceneObjectResources, repository, runMutation, selectedObjectAddress]);

  const loadSceneByBuildIndex = useCallback(async (buildIndex: number) => {
    return runMutation('load-scene', () => repository.loadSceneByBuildIndex(buildIndex), {
      afterSuccess: async () => {
        await refreshSceneWorkspace();
      },
    });
  }, [refreshSceneWorkspace, repository, runMutation]);

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
