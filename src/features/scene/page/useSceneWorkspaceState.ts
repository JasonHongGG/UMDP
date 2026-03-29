import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneComponentSummary,
  RuntimeSceneMutationOperation,
  RuntimeSceneMutationResult,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { WorkspaceLifecycleState } from '@/shared/contracts';

const EMPTY_SCENE_WORKSPACE_STATE: SceneWorkspaceState = {
  refreshStatus: 'idle',
  errorMessage: null,
  snapshot: null,
  lastUpdatedAt: null,
};

type SceneMutationState = {
  operation: RuntimeSceneMutationOperation | null;
  loading: boolean;
  errorMessage: string | null;
};

const EMPTY_MUTATION_STATE: SceneMutationState = {
  operation: null,
  loading: false,
  errorMessage: null,
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logSceneError(context: string, error: unknown) {
  console.log(`[scene] ${context}`, error);
  return toErrorMessage(error);
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function logScenePerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  console.log(`[perf][scene] ${label} completed in ${(nowMs() - startedAt).toFixed(1)}ms`, details ?? {});
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

function isTerminalChildrenTaskStatus(status: RuntimeSceneObjectChildrenTaskState['status']) {
  return status === 'ready' || status === 'error' || status === 'cancelled';
}

function isTerminalInspectorTaskStatus(status: RuntimeSceneObjectInspectorTaskState['status']) {
  return status === 'ready' || status === 'error' || status === 'cancelled';
}

function buildSummaryLookup(summaries: RuntimeSceneNodeSummary[]) {
  return new Map(summaries.map((summary) => [summary.objectAddress, summary]));
}

function patchNodeListWithLookup(nodes: RuntimeSceneNodeSummary[], lookup: Map<string, RuntimeSceneNodeSummary>) {
  let touched = false;
  const next = nodes.map((node) => {
    const replacement = lookup.get(node.objectAddress);
    if (!replacement) {
      return node;
    }

    touched = true;
    return replacement;
  });

  return touched ? next : nodes;
}

function sameNodeOrder(left: RuntimeSceneNodeSummary[], right: RuntimeSceneNodeSummary[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((node, index) => node.objectAddress === right[index]?.objectAddress);
}

function sameComponentOrder(left: RuntimeSceneComponentSummary[], right: RuntimeSceneComponentSummary[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((component, index) => component.componentAddress === right[index]?.componentAddress);
}

function buildInspectorSnapshot(taskState: RuntimeSceneObjectInspectorTaskState): RuntimeSceneObjectInspectorSnapshot | null {
  if (!taskState.header) {
    return null;
  }

  return {
    generatedAt: taskState.header.generatedAt,
    sceneHandle: taskState.header.sceneHandle,
    sceneName: taskState.header.sceneName,
    object: taskState.header.object,
    parent: taskState.header.parent,
    transform: taskState.header.transform,
    children: taskState.children,
    components: taskState.components,
  };
}

function updateNodeInList(nodes: RuntimeSceneNodeSummary[], summary: RuntimeSceneNodeSummary) {
  let touched = false;
  const next = nodes.map((node) => {
    if (node.objectAddress !== summary.objectAddress) {
      return node;
    }

    touched = true;
    return summary;
  });

  return touched ? next : nodes;
}

function insertNodeIntoList(nodes: RuntimeSceneNodeSummary[], summary: RuntimeSceneNodeSummary) {
  const existingIndex = nodes.findIndex((node) => node.objectAddress === summary.objectAddress);
  if (existingIndex >= 0) {
    return updateNodeInList(nodes, summary);
  }

  return [...nodes, summary];
}

function removeNodeFromList(nodes: RuntimeSceneNodeSummary[], objectAddress: string) {
  const next = nodes.filter((node) => node.objectAddress !== objectAddress);
  return next.length === nodes.length ? nodes : next;
}

function adjustNodeChildCount(summary: RuntimeSceneNodeSummary, delta: number) {
  const childCount = Math.max(0, summary.childCount + delta);
  return {
    ...summary,
    childCount,
    hasChildren: childCount > 0,
  };
}

function adjustNodeChildCountInList(nodes: RuntimeSceneNodeSummary[], objectAddress: string, delta: number) {
  let touched = false;
  const next = nodes.map((node) => {
    if (node.objectAddress !== objectAddress) {
      return node;
    }

    touched = true;
    return adjustNodeChildCount(node, delta);
  });

  return touched ? next : nodes;
}

function patchRootsWithSummary(sceneWorkspace: SceneWorkspaceState, summary: RuntimeSceneNodeSummary) {
  if (!sceneWorkspace.snapshot) {
    return sceneWorkspace;
  }

  let touched = false;
  const scenes = sceneWorkspace.snapshot.scenes.map((scene) => {
    const roots = updateNodeInList(scene.roots, summary);
    if (roots === scene.roots) {
      return scene;
    }

    touched = true;
    return { ...scene, roots };
  });

  if (!touched) {
    return sceneWorkspace;
  }

  return {
    ...sceneWorkspace,
    snapshot: {
      ...sceneWorkspace.snapshot,
      scenes,
    },
  };
}

function patchRootsWithSummaries(sceneWorkspace: SceneWorkspaceState, summaries: RuntimeSceneNodeSummary[]) {
  if (!sceneWorkspace.snapshot || summaries.length === 0) {
    return sceneWorkspace;
  }

  const summaryLookup = buildSummaryLookup(summaries);
  let touched = false;
  const scenes = sceneWorkspace.snapshot.scenes.map((scene) => {
    const roots = patchNodeListWithLookup(scene.roots, summaryLookup);
    if (roots === scene.roots) {
      return scene;
    }

    touched = true;
    return { ...scene, roots };
  });

  if (!touched) {
    return sceneWorkspace;
  }

  return {
    ...sceneWorkspace,
    snapshot: {
      ...sceneWorkspace.snapshot,
      scenes,
    },
  };
}

function insertRootNode(sceneWorkspace: SceneWorkspaceState, sceneHandle: number | null, summary: RuntimeSceneNodeSummary | null) {
  if (!sceneWorkspace.snapshot || sceneHandle == null || !summary) {
    return sceneWorkspace;
  }

  let touched = false;
  const scenes = sceneWorkspace.snapshot.scenes.map((scene) => {
    if (scene.sceneHandle !== sceneHandle) {
      return scene;
    }

    const roots = insertNodeIntoList(scene.roots, summary);
    if (roots === scene.roots) {
      return scene;
    }

    touched = true;
    return { ...scene, roots };
  });

  if (!touched) {
    return sceneWorkspace;
  }

  return {
    ...sceneWorkspace,
    snapshot: {
      ...sceneWorkspace.snapshot,
      scenes,
    },
  };
}

function removeRootNode(sceneWorkspace: SceneWorkspaceState, sceneHandle: number | null, objectAddress: string | null) {
  if (!sceneWorkspace.snapshot || sceneHandle == null || !objectAddress) {
    return sceneWorkspace;
  }

  let touched = false;
  const scenes = sceneWorkspace.snapshot.scenes.map((scene) => {
    if (scene.sceneHandle !== sceneHandle) {
      return scene;
    }

    const roots = removeNodeFromList(scene.roots, objectAddress);
    if (roots === scene.roots) {
      return scene;
    }

    touched = true;
    return { ...scene, roots };
  });

  if (!touched) {
    return sceneWorkspace;
  }

  return {
    ...sceneWorkspace,
    snapshot: {
      ...sceneWorkspace.snapshot,
      scenes,
    },
  };
}

function patchChildrenWithSummary(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  summary: RuntimeSceneNodeSummary,
) {
  let touched = false;
  const nextEntries = Object.entries(childrenByParent).map(([parent, children]) => {
    const updated = updateNodeInList(children, summary);
    if (updated !== children) {
      touched = true;
    }
    return [parent, updated] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : childrenByParent;
}

function patchChildrenWithSummaries(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  summaries: RuntimeSceneNodeSummary[],
) {
  if (summaries.length === 0) {
    return childrenByParent;
  }

  const summaryLookup = buildSummaryLookup(summaries);
  let touched = false;
  const nextEntries = Object.entries(childrenByParent).map(([parent, children]) => {
    const updated = patchNodeListWithLookup(children, summaryLookup);
    if (updated !== children) {
      touched = true;
    }
    return [parent, updated] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : childrenByParent;
}

function adjustChildrenCounts(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  objectAddress: string,
  delta: number,
) {
  let touched = false;
  const nextEntries = Object.entries(childrenByParent).map(([parent, children]) => {
    const updated = adjustNodeChildCountInList(children, objectAddress, delta);
    if (updated !== children) {
      touched = true;
    }
    return [parent, updated] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : childrenByParent;
}

function insertChildNode(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  parentObjectAddress: string,
  summary: RuntimeSceneNodeSummary | null,
) {
  if (!summary || !Object.prototype.hasOwnProperty.call(childrenByParent, parentObjectAddress)) {
    return childrenByParent;
  }

  return {
    ...childrenByParent,
    [parentObjectAddress]: insertNodeIntoList(childrenByParent[parentObjectAddress] ?? [], summary),
  };
}

function removeChildNode(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  parentObjectAddress: string,
  objectAddress: string | null,
) {
  if (!objectAddress || !Object.prototype.hasOwnProperty.call(childrenByParent, parentObjectAddress)) {
    return childrenByParent;
  }

  const updated = removeNodeFromList(childrenByParent[parentObjectAddress] ?? [], objectAddress);
  if (updated === childrenByParent[parentObjectAddress]) {
    return childrenByParent;
  }

  return {
    ...childrenByParent,
    [parentObjectAddress]: updated,
  };
}

function removeNodeEverywhere(
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  objectAddress: string | null,
) {
  if (!objectAddress) {
    return childrenByParent;
  }

  let touched = false;
  const nextEntries: Array<[string, RuntimeSceneNodeSummary[]]> = [];
  for (const [parent, children] of Object.entries(childrenByParent)) {
    if (parent === objectAddress) {
      touched = true;
      continue;
    }

    const updated = removeNodeFromList(children, objectAddress);
    if (updated !== children) {
      touched = true;
    }
    nextEntries.push([parent, updated]);
  }

  return touched ? Object.fromEntries(nextEntries) : childrenByParent;
}

function patchInspectorsWithSummary(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  summary: RuntimeSceneNodeSummary,
) {
  let touched = false;
  const nextEntries = Object.entries(inspectors).map(([address, inspector]) => {
    let nextInspector = inspector;

    if (inspector.object.objectAddress === summary.objectAddress) {
      nextInspector = { ...nextInspector, object: summary };
    }
    if (nextInspector.parent?.objectAddress === summary.objectAddress) {
      nextInspector = { ...nextInspector, parent: summary };
    }

    const nextChildren = updateNodeInList(nextInspector.children, summary);
    if (nextChildren !== nextInspector.children) {
      nextInspector = { ...nextInspector, children: nextChildren };
    }

    if (nextInspector !== inspector) {
      touched = true;
    }

    return [address, nextInspector] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : inspectors;
}

function patchInspectorsWithSummaries(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  summaries: RuntimeSceneNodeSummary[],
) {
  if (summaries.length === 0) {
    return inspectors;
  }

  const summaryLookup = buildSummaryLookup(summaries);
  let touched = false;
  const nextEntries = Object.entries(inspectors).map(([address, inspector]) => {
    let nextInspector = inspector;

    const objectSummary = summaryLookup.get(inspector.object.objectAddress);
    if (objectSummary) {
      nextInspector = { ...nextInspector, object: objectSummary };
    }

    if (nextInspector.parent) {
      const parentSummary = summaryLookup.get(nextInspector.parent.objectAddress);
      if (parentSummary) {
        nextInspector = { ...nextInspector, parent: parentSummary };
      }
    }

    const nextChildren = patchNodeListWithLookup(nextInspector.children, summaryLookup);
    if (nextChildren !== nextInspector.children) {
      nextInspector = { ...nextInspector, children: nextChildren };
    }

    if (nextInspector !== inspector) {
      touched = true;
    }

    return [address, nextInspector] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : inspectors;
}

function adjustInspectorCounts(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  objectAddress: string,
  delta: number,
) {
  let touched = false;
  const nextEntries = Object.entries(inspectors).map(([address, inspector]) => {
    let nextInspector = inspector;

    if (inspector.object.objectAddress === objectAddress) {
      nextInspector = {
        ...nextInspector,
        object: adjustNodeChildCount(inspector.object, delta),
      };
    }
    if (nextInspector.parent?.objectAddress === objectAddress) {
      nextInspector = {
        ...nextInspector,
        parent: adjustNodeChildCount(nextInspector.parent, delta),
      };
    }

    const nextChildren = adjustNodeChildCountInList(nextInspector.children, objectAddress, delta);
    if (nextChildren !== nextInspector.children) {
      nextInspector = { ...nextInspector, children: nextChildren };
    }

    if (nextInspector !== inspector) {
      touched = true;
    }

    return [address, nextInspector] as const;
  });

  return touched ? Object.fromEntries(nextEntries) : inspectors;
}

function insertChildIntoInspectors(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  parentObjectAddress: string,
  summary: RuntimeSceneNodeSummary | null,
) {
  if (!summary || !inspectors[parentObjectAddress]) {
    return inspectors;
  }

  return {
    ...inspectors,
    [parentObjectAddress]: {
      ...inspectors[parentObjectAddress],
      children: insertNodeIntoList(inspectors[parentObjectAddress].children, summary),
    },
  };
}

function removeNodeFromInspectors(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  objectAddress: string | null,
) {
  if (!objectAddress) {
    return inspectors;
  }

  let touched = false;
  const nextEntries: Array<[string, RuntimeSceneObjectInspectorSnapshot]> = [];
  for (const [address, inspector] of Object.entries(inspectors)) {
    if (address === objectAddress) {
      touched = true;
      continue;
    }

    let nextInspector = inspector;
    if (inspector.parent?.objectAddress === objectAddress) {
      nextInspector = { ...nextInspector, parent: null };
    }

    const nextChildren = removeNodeFromList(nextInspector.children, objectAddress);
    if (nextChildren !== nextInspector.children) {
      nextInspector = { ...nextInspector, children: nextChildren };
    }

    if (nextInspector !== inspector) {
      touched = true;
    }
    nextEntries.push([address, nextInspector]);
  }

  return touched ? Object.fromEntries(nextEntries) : inspectors;
}

function mergeInspectorCaches(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  snapshot: RuntimeSceneObjectInspectorSnapshot,
) {
  if (inspectors[snapshot.object.objectAddress] === snapshot) {
    return inspectors;
  }

  return {
    ...inspectors,
    [snapshot.object.objectAddress]: snapshot,
  };
}

export function useSceneWorkspaceState({
  repository,
  workspaceLifecycle,
  active,
}: {
  repository: AnalysisRepository;
  workspaceLifecycle: WorkspaceLifecycleState;
  active: boolean;
}) {
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

      while (!isTerminalInspectorTaskStatus(taskState.status) && inspectorPollTokenRef.current === pollToken) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        const nextTaskState = await repository.getSceneObjectInspectorState();
        if (!nextTaskState || inspectorPollTokenRef.current !== pollToken) {
          continue;
        }
        if (nextTaskState.taskId !== activeInspectorTaskIdRef.current || nextTaskState.objectAddress !== objectAddress) {
          continue;
        }

        taskState = nextTaskState;
        applyInspectorTaskState(taskState);
      }

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
    } finally {
      if (inspectorPollTokenRef.current === pollToken) {
        setInspectorLoadingByAddress((previous) => ({
          ...previous,
          [objectAddress]: false,
        }));
      }
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

      while (!isTerminalChildrenTaskStatus(taskState.status) && (childPollTokensRef.current[objectAddress] ?? 0) === pollToken) {
        await new Promise((resolve) => window.setTimeout(resolve, 90));
        const nextTaskState = await repository.getSceneObjectChildrenState(objectAddress);
        if (!nextTaskState || (childPollTokensRef.current[objectAddress] ?? 0) !== pollToken) {
          continue;
        }
        if (nextTaskState.taskId !== activeChildTaskIdByParentRef.current[objectAddress]) {
          continue;
        }

        taskState = nextTaskState;
        applySceneChildrenTaskState(taskState);
      }

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
    } finally {
      if ((childPollTokensRef.current[objectAddress] ?? 0) === pollToken) {
        setLoadingChildrenByParent((previous) => ({
          ...previous,
          [objectAddress]: false,
        }));
      }
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

    setInspectorTaskByAddress((previous) => {
      const impacted = [
        result.targetObjectAddress,
        result.parentObjectAddress,
        result.deletedObjectAddress,
        result.object?.objectAddress,
      ].filter((value): value is string => Boolean(value));

      if (impacted.length === 0) {
        return previous;
      }

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

    setChildTaskByParent((previous) => {
      const impacted = [
        result.targetObjectAddress,
        result.parentObjectAddress,
        result.deletedObjectAddress,
        result.object?.objectAddress,
      ].filter((value): value is string => Boolean(value));

      if (impacted.length === 0) {
        return previous;
      }

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

    switch (result.operation) {
      case 'create-child': {
        if (result.parentObjectAddress && result.object) {
          bumpParentChildCount(result.parentObjectAddress, 1);
          setChildrenByParent((previous) => insertChildNode(previous, result.parentObjectAddress!, result.object));
          setInspectorsByAddress((previous) => insertChildIntoInspectors(previous, result.parentObjectAddress!, result.object));
        }
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
    setSceneMutationState({
      operation,
      loading: true,
      errorMessage: null,
    });

    try {
      const result = await runner();
      applySceneMutation(result);
      logScenePerf(`sceneMutation:${operation}`, startedAt, {
        targetObjectAddress: result.targetObjectAddress,
        parentObjectAddress: result.parentObjectAddress,
      });
      return result;
    } catch (error) {
      const message = logSceneError(`scene mutation failed: ${operation}`, error);
      setSceneMutationState({
        operation,
        loading: false,
        errorMessage: message,
      });
      throw error;
    } finally {
      setSceneMutationState((previous) => ({
        ...previous,
        loading: false,
      }));
    }
  }, [applySceneMutation]);

  const createSceneChild = useCallback(async (name: string) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('create-child', () => repository.createSceneChild(selectedObjectAddress, name));
  }, [repository, runMutation, selectedObjectAddress]);

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

  const setSceneObjectActive = useCallback(async (activeSelf: boolean) => {
    if (!selectedObjectAddress) {
      return null;
    }

    return runMutation('set-active', () => repository.setSceneObjectActive(selectedObjectAddress, activeSelf));
  }, [repository, runMutation, selectedObjectAddress]);

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
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    setSceneObjectActive,
    sceneMutationState,
    sceneRootsByHandle,
  };
}