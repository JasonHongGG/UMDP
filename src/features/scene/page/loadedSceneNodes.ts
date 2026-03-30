import type { RuntimeSceneNodeSummary, SceneWorkspaceState } from '@/domain/analysis/contracts';

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

export interface LoadedSceneSearchProjection {
  matchCount: number;
  matchingNodeAddresses: Set<string>;
  visibleNodeAddresses: Set<string>;
}

export function buildLoadedSceneGraph(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
): LoadedSceneGraph {
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  const records: LoadedSceneNodeRecord[] = [];
  const recordByAddress = new Map<string, LoadedSceneNodeRecord>();

  const visitNode = (
    sceneHandle: number,
    sceneName: string,
    node: RuntimeSceneNodeSummary,
    depth: number,
    ancestors: string[],
    ancestorAddresses: string[],
  ) => {
    const pathSegments = [...ancestors, node.name];
    const canonicalPath = pathSegments.join('/');
    const displayPath = pathSegments.join(' / ');

    const record: LoadedSceneNodeRecord = {
      sceneHandle,
      sceneName,
      depth,
      ancestorAddresses,
      node,
      canonicalPath,
      displayPath,
      searchText: [
        sceneName,
        node.name,
        displayPath,
        node.tag ?? '',
        node.layer == null ? '' : String(node.layer),
      ].join(' ').toLowerCase(),
    };

    records.push(record);
    recordByAddress.set(node.objectAddress, record);

    const children = childrenByParent[node.objectAddress] ?? [];
    children.forEach((child) => visitNode(
      sceneHandle,
      sceneName,
      child,
      depth + 1,
      pathSegments,
      [...ancestorAddresses, node.objectAddress],
    ));
  };

  scenes.forEach((scene) => {
    scene.roots.forEach((node) => visitNode(scene.sceneHandle, scene.name, node, 0, [], []));
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