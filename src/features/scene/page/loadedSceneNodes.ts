import type { RuntimeSceneNodeSummary, SceneWorkspaceState } from '@/domain/analysis/contracts';

export interface LoadedSceneNodeRecord {
  sceneHandle: number;
  sceneName: string;
  depth: number;
  node: RuntimeSceneNodeSummary;
  canonicalPath: string;
  displayPath: string;
  searchText: string;
}

export function collectLoadedSceneNodeRecords(
  sceneWorkspace: SceneWorkspaceState,
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>,
): LoadedSceneNodeRecord[] {
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  const records: LoadedSceneNodeRecord[] = [];

  const visitNode = (
    sceneHandle: number,
    sceneName: string,
    node: RuntimeSceneNodeSummary,
    depth: number,
    ancestors: string[],
  ) => {
    const pathSegments = [...ancestors, node.name];
    const canonicalPath = pathSegments.join('/');
    const displayPath = pathSegments.join(' / ');

    records.push({
      sceneHandle,
      sceneName,
      depth,
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
    });

    const children = childrenByParent[node.objectAddress] ?? [];
    children.forEach((child) => visitNode(sceneHandle, sceneName, child, depth + 1, pathSegments));
  };

  scenes.forEach((scene) => {
    scene.roots.forEach((node) => visitNode(scene.sceneHandle, scene.name, node, 0, []));
  });

  return records;
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