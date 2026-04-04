import type {
  RuntimeSceneComponentSummary,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneResourceState,
  RuntimeSceneTransformSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import { createDiagnosticsLogger } from '@/shared/diagnostics';

const sceneDiagnostics = createDiagnosticsLogger({
  channel: 'scene',
  origin: 'sceneWorkspaceState',
});

export const EMPTY_SCENE_WORKSPACE_STATE: SceneWorkspaceState = {
  resourceRevision: 0,
  sessionKey: null,
  refreshStatus: 'idle',
  errorMessage: null,
  mutationEpoch: 0,
  snapshot: null,
  lastUpdatedAt: null,
  resourceState: {
    resourceKind: 'catalog',
    resourceRevision: 0,
    sessionKey: null,
    freshness: 'empty',
    lastSuccessfulAt: null,
    isRetainingSnapshot: false,
    errorMessage: null,
  },
};

export function createEmptySceneResourceState(resourceKind: RuntimeSceneResourceState['resourceKind']): RuntimeSceneResourceState {
  return {
    resourceKind,
    resourceRevision: 0,
    sessionKey: null,
    freshness: 'empty',
    lastSuccessfulAt: null,
    isRetainingSnapshot: false,
    errorMessage: null,
  };
}

export function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function logSceneError(context: string, error: unknown) {
  sceneDiagnostics.error('Scene operation failed.', {
    error,
    context: {
      operation: context,
    },
  });
  return toErrorMessage(error);
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function logScenePerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  sceneDiagnostics.debug('Scene operation completed.', {
    context: {
      operation: label,
      durationMs: nowMs() - startedAt,
      ...(details ?? {}),
    },
  });
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

export function isTerminalChildrenTaskStatus(status: RuntimeSceneObjectChildrenTaskState['status']) {
  return status === 'ready' || status === 'error' || status === 'cancelled';
}

export function isTerminalInspectorTaskStatus(status: RuntimeSceneObjectInspectorTaskState['status']) {
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

export function sameNodeOrder(left: RuntimeSceneNodeSummary[], right: RuntimeSceneNodeSummary[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((node, index) => node.objectAddress === right[index]?.objectAddress);
}

export function sameComponentOrder(left: RuntimeSceneComponentSummary[], right: RuntimeSceneComponentSummary[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((component, index) => component.componentAddress === right[index]?.componentAddress);
}

export function buildInspectorSnapshot(taskState: RuntimeSceneObjectInspectorTaskState): RuntimeSceneObjectInspectorSnapshot | null {
  if (!taskState.header) {
    return null;
  }

  return {
    generatedAt: taskState.header.generatedAt,
    sceneHandle: taskState.header.sceneHandle,
    sceneName: taskState.header.sceneName,
    sceneKind: taskState.header.sceneKind,
    object: taskState.header.object,
    parent: taskState.header.parent,
    hierarchyPath: taskState.header.hierarchyPath,
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

export function adjustNodeChildCountInList(nodes: RuntimeSceneNodeSummary[], objectAddress: string, delta: number) {
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

export function patchRootsWithSummary(sceneWorkspace: SceneWorkspaceState, summary: RuntimeSceneNodeSummary) {
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

export function patchRootsWithSummaries(sceneWorkspace: SceneWorkspaceState, summaries: RuntimeSceneNodeSummary[]) {
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

export function insertRootNode(sceneWorkspace: SceneWorkspaceState, sceneHandle: number | null, summary: RuntimeSceneNodeSummary | null) {
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

export function removeRootNode(sceneWorkspace: SceneWorkspaceState, sceneHandle: number | null, objectAddress: string | null) {
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

export function patchChildrenWithSummary(
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

export function patchChildrenWithSummaries(
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

export function adjustChildrenCounts(
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

export function insertChildNode(
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

export function removeChildNode(
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

export function removeNodeEverywhere(
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

export function patchInspectorsWithSummary(
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

export function patchInspectorsWithSummaries(
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

export function adjustInspectorCounts(
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

export function insertChildIntoInspectors(
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

export function removeNodeFromInspectors(
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

export function mergeInspectorCaches(
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

export function patchInspectorTransform(
  inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot>,
  objectAddress: string,
  transform: RuntimeSceneTransformSnapshot,
) {
  const current = inspectors[objectAddress];
  if (!current) {
    return inspectors;
  }

  return {
    ...inspectors,
    [objectAddress]: {
      ...current,
      transform,
    },
  };
}