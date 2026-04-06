import type {
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectHeaderTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';

export interface LoadedSceneNodeRecord {
  sceneHandle: number;
  sceneName: string;
  depth: number;
  ancestorAddresses: string[];
  node: RuntimeSceneNodeSummary;
  canonicalPath: string;
  displayPath: string;
  searchText: string;
}

export interface LoadedSceneGraph {
  records: LoadedSceneNodeRecord[];
  recordByAddress: Map<string, LoadedSceneNodeRecord>;
}

export const EMPTY_LOADED_SCENE_GRAPH: LoadedSceneGraph = {
  records: [],
  recordByAddress: new Map<string, LoadedSceneNodeRecord>(),
};

export interface LoadedSceneSearchProjection {
  matchCount: number;
  matchingNodeAddresses: Set<string>;
  visibleNodeAddresses: Set<string>;
}

export function buildLoadedSceneGraph(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState> = {},
): LoadedSceneGraph {
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  const records: LoadedSceneNodeRecord[] = [];
  const recordByAddress = new Map<string, LoadedSceneNodeRecord>();
  const nodeByAddress = new Map<string, {
    sceneHandle: number | null;
    sceneName: string | null;
    parentAddress: string | null;
    summary: RuntimeSceneNodeSummary;
    childAddresses: string[];
  }>();

  const mergeSummary = (
    existing: RuntimeSceneNodeSummary,
    incoming: RuntimeSceneNodeSummary,
  ): RuntimeSceneNodeSummary => ({
    objectAddress: existing.objectAddress,
    transformAddress: incoming.transformAddress ?? existing.transformAddress ?? null,
    parentObjectAddress: incoming.parentObjectAddress ?? existing.parentObjectAddress ?? null,
    name: incoming.name || existing.name,
    activeSelf: incoming.activeSelf,
    isStatic: incoming.isStatic ?? existing.isStatic ?? null,
    childCount: Math.max(existing.childCount, incoming.childCount),
    hasChildren: existing.hasChildren || incoming.hasChildren,
    componentCount: incoming.componentCount ?? existing.componentCount ?? null,
    layer: incoming.layer ?? existing.layer ?? null,
    tag: incoming.tag ?? existing.tag ?? null,
    hideFlags: incoming.hideFlags ?? existing.hideFlags ?? null,
    path: incoming.path ?? existing.path ?? null,
  });

  const createPlaceholderSummary = (
    objectAddress: string,
    name: string,
    parentObjectAddress: string | null,
  ): RuntimeSceneNodeSummary => ({
    objectAddress,
    transformAddress: null,
    parentObjectAddress,
    name,
    activeSelf: true,
    isStatic: null,
    childCount: 0,
    hasChildren: false,
    componentCount: null,
    layer: null,
    tag: null,
    hideFlags: null,
    path: null,
  });

  const ensureNode = (
    summary: RuntimeSceneNodeSummary,
    sceneHandle: number | null,
    sceneName: string | null,
    parentAddress: string | null,
  ) => {
    const existing = nodeByAddress.get(summary.objectAddress);
    if (existing) {
      existing.summary = mergeSummary(existing.summary, summary);
      existing.sceneHandle = existing.sceneHandle ?? sceneHandle;
      existing.sceneName = existing.sceneName ?? sceneName;
      existing.parentAddress = existing.parentAddress ?? parentAddress ?? summary.parentObjectAddress ?? null;
      existing.summary = {
        ...existing.summary,
        parentObjectAddress: existing.parentAddress,
      };
      return existing;
    }

    const created = {
      sceneHandle,
      sceneName,
      parentAddress: parentAddress ?? summary.parentObjectAddress ?? null,
      summary: {
        ...summary,
        parentObjectAddress: parentAddress ?? summary.parentObjectAddress ?? null,
      },
      childAddresses: [] as string[],
    };
    nodeByAddress.set(summary.objectAddress, created);
    return created;
  };

  const linkNodes = (parentAddress: string, childAddress: string) => {
    const parent = nodeByAddress.get(parentAddress);
    const child = nodeByAddress.get(childAddress);
    if (!parent || !child) {
      return;
    }

    if (!parent.childAddresses.includes(childAddress)) {
      parent.childAddresses.push(childAddress);
    }

    child.parentAddress = parentAddress;
    child.summary = {
      ...child.summary,
      parentObjectAddress: parentAddress,
    };
  };

  const visitCatalogNode = (
    sceneHandle: number,
    sceneName: string,
    node: RuntimeSceneNodeSummary,
    parentAddress: string | null,
  ) => {
    ensureNode(node, sceneHandle, sceneName, parentAddress);
    if (parentAddress) {
      linkNodes(parentAddress, node.objectAddress);
    }

    const children = childrenByParent[node.objectAddress] ?? [];
    children.forEach((child) => visitCatalogNode(sceneHandle, sceneName, child, node.objectAddress));
  };

  scenes.forEach((scene) => {
    scene.roots.forEach((node) => visitCatalogNode(scene.sceneHandle, scene.name, node, null));
  });

  Object.values(headerTaskByAddress).forEach((taskState) => {
    const header = taskState.header;
    if (!header) {
      return;
    }

    const sceneHandle = header.sceneHandle ?? null;
    const sceneName = header.sceneName ?? (sceneHandle == null ? null : `Scene ${sceneHandle}`);
    let previousAddress: string | null = null;

    header.hierarchyPath.forEach((entry) => {
      const summary = entry.objectAddress === header.object.objectAddress
        ? header.object
        : header.parent && header.parent.objectAddress === entry.objectAddress
          ? header.parent
          : createPlaceholderSummary(entry.objectAddress, entry.name, previousAddress);
      ensureNode(summary, sceneHandle, sceneName, previousAddress);
      if (previousAddress) {
        linkNodes(previousAddress, entry.objectAddress);
      }
      previousAddress = entry.objectAddress;
    });

    const objectNode = ensureNode(header.object, sceneHandle, sceneName, header.object.parentObjectAddress);
    if (header.parent) {
      ensureNode(header.parent, sceneHandle, sceneName, header.parent.parentObjectAddress);
      linkNodes(header.parent.objectAddress, header.object.objectAddress);
    } else if (previousAddress && previousAddress !== header.object.objectAddress) {
      linkNodes(previousAddress, header.object.objectAddress);
    }

    if (objectNode.parentAddress == null && header.hierarchyPath.length > 1) {
      const fallbackParent = header.hierarchyPath[header.hierarchyPath.length - 2]?.objectAddress ?? null;
      if (fallbackParent) {
        linkNodes(fallbackParent, header.object.objectAddress);
      }
    }
  });

  nodeByAddress.forEach((node) => {
    const childCount = Math.max(node.summary.childCount, node.childAddresses.length);
    node.summary = {
      ...node.summary,
      childCount,
      hasChildren: node.summary.hasChildren || childCount > 0,
      parentObjectAddress: node.parentAddress,
    };
  });

  const rootAddressesBySceneHandle = new Map<number, string[]>();
  const pushRootAddress = (sceneHandle: number, objectAddress: string) => {
    const roots = rootAddressesBySceneHandle.get(sceneHandle) ?? [];
    if (!roots.includes(objectAddress)) {
      rootAddressesBySceneHandle.set(sceneHandle, [...roots, objectAddress]);
    }
  };

  scenes.forEach((scene) => {
    scene.roots.forEach((root) => pushRootAddress(scene.sceneHandle, root.objectAddress));
  });

  nodeByAddress.forEach((node, objectAddress) => {
    if (node.sceneHandle == null) {
      return;
    }

    if (!node.parentAddress || !nodeByAddress.has(node.parentAddress)) {
      pushRootAddress(node.sceneHandle, objectAddress);
    }
  });

  const visited = new Set<string>();
  const visitNode = (
    sceneHandle: number,
    sceneName: string,
    objectAddress: string,
    depth: number,
    ancestors: string[],
    ancestorAddresses: string[],
  ) => {
    const accumulated = nodeByAddress.get(objectAddress);
    if (!accumulated || visited.has(objectAddress)) {
      return;
    }

    visited.add(objectAddress);

    const pathSegments = [...ancestors, accumulated.summary.name];
    const canonicalPath = pathSegments.join('/');
    const displayPath = pathSegments.join(' / ');

    const record: LoadedSceneNodeRecord = {
      sceneHandle,
      sceneName,
      depth,
      ancestorAddresses,
      node: {
        ...accumulated.summary,
        path: accumulated.summary.path ?? canonicalPath,
      },
      canonicalPath,
      displayPath,
      searchText: [
        sceneName,
        accumulated.summary.name,
        displayPath,
        accumulated.summary.tag ?? '',
        accumulated.summary.layer == null ? '' : String(accumulated.summary.layer),
      ].join(' ').toLowerCase(),
    };

    records.push(record);
    recordByAddress.set(objectAddress, record);

    accumulated.childAddresses.forEach((childAddress) => visitNode(
      sceneHandle,
      sceneName,
      childAddress,
      depth + 1,
      pathSegments,
      [...ancestorAddresses, objectAddress],
    ));
  };

  scenes.forEach((scene) => {
    (rootAddressesBySceneHandle.get(scene.sceneHandle) ?? []).forEach((objectAddress) => {
      visitNode(scene.sceneHandle, scene.name, objectAddress, 0, [], []);
    });
  });

  rootAddressesBySceneHandle.forEach((rootAddresses, sceneHandle) => {
    if (scenes.some((scene) => scene.sceneHandle === sceneHandle)) {
      return;
    }

    const sceneName = nodeByAddress.get(rootAddresses[0])?.sceneName ?? `Scene ${sceneHandle}`;
    rootAddresses.forEach((objectAddress) => {
      visitNode(sceneHandle, sceneName, objectAddress, 0, [], []);
    });
  });

  return {
    records,
    recordByAddress,
  };
}

export function collectLoadedSceneNodeRecords(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
): LoadedSceneNodeRecord[] {
  return buildLoadedSceneGraph(sceneWorkspace, childrenByParent).records;
}

export function createLoadedSceneSearchProjection(
  graph: LoadedSceneGraph,
  query: string,
): LoadedSceneSearchProjection | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const visibleNodeAddresses = new Set<string>();
  const matchingNodeAddresses = new Set<string>();

  graph.records.forEach((record) => {
    if (!record.searchText.includes(normalizedQuery)) {
      return;
    }

    matchingNodeAddresses.add(record.node.objectAddress);
    record.ancestorAddresses.forEach((address) => visibleNodeAddresses.add(address));
    visibleNodeAddresses.add(record.node.objectAddress);
  });

  return {
    matchCount: matchingNodeAddresses.size,
    matchingNodeAddresses,
    visibleNodeAddresses,
  };
}

export function filterLoadedSceneNodeRecords(
  graph: LoadedSceneGraph,
  query: string,
  blockedAddresses?: ReadonlySet<string>,
): LoadedSceneNodeRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  return graph.records.filter((record) => {
    if (blockedAddresses?.has(record.node.objectAddress)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return record.searchText.includes(normalizedQuery);
  });
}

export function collectLoadedDescendantAddresses(
  objectAddress: string,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
): Set<string> {
  const descendants = new Set<string>();
  const stack = [...(childrenByParent[objectAddress] ?? [])];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || descendants.has(next.objectAddress)) {
      continue;
    }

    descendants.add(next.objectAddress);
    stack.push(...(childrenByParent[next.objectAddress] ?? []));
  }

  return descendants;
}