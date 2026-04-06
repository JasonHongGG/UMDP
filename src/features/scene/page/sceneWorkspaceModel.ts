import type {
  RuntimeSceneHierarchyPathEntry,
  RuntimeSceneKind,
  RuntimeSceneNodeSummary,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneTransformSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import {
  buildInspectorSnapshot,
  syncInspectorComponentCount,
} from './sceneWorkspaceStatePatches';

export interface SceneEntityRecord {
  objectAddress: string;
  summary: RuntimeSceneNodeSummary;
  sceneHandle: number | null;
  sceneName: string | null;
  sceneKind: RuntimeSceneKind | null;
  parentObjectAddress: string | null;
  childAddresses: string[];
  hierarchyPath: RuntimeSceneHierarchyPathEntry[];
  transform: RuntimeSceneTransformSnapshot | null;
}

export type SceneEntityMap = Record<string, SceneEntityRecord>;

function createPlaceholderSummary(
  objectAddress: string,
  name: string,
  parentObjectAddress: string | null,
): RuntimeSceneNodeSummary {
  return {
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
  };
}

function mergeSummary(
  existing: RuntimeSceneNodeSummary,
  incoming: RuntimeSceneNodeSummary,
  parentObjectAddress: string | null,
): RuntimeSceneNodeSummary {
  return {
    objectAddress: existing.objectAddress,
    transformAddress: incoming.transformAddress ?? existing.transformAddress ?? null,
    parentObjectAddress,
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
  };
}

function ensureEntity(
  entities: SceneEntityMap,
  summary: RuntimeSceneNodeSummary,
  sceneHandle: number | null,
  sceneName: string | null,
  sceneKind: RuntimeSceneKind | null,
  parentObjectAddress: string | null,
) {
  const existing = entities[summary.objectAddress];
  if (existing) {
    existing.summary = mergeSummary(existing.summary, summary, existing.parentObjectAddress ?? parentObjectAddress ?? summary.parentObjectAddress ?? null);
    existing.sceneHandle = existing.sceneHandle ?? sceneHandle;
    existing.sceneName = existing.sceneName ?? sceneName;
    existing.sceneKind = existing.sceneKind ?? sceneKind;
    existing.parentObjectAddress = existing.parentObjectAddress ?? parentObjectAddress ?? summary.parentObjectAddress ?? null;
    existing.summary = {
      ...existing.summary,
      parentObjectAddress: existing.parentObjectAddress,
    };
    return existing;
  }

  const created: SceneEntityRecord = {
    objectAddress: summary.objectAddress,
    summary: {
      ...summary,
      parentObjectAddress: parentObjectAddress ?? summary.parentObjectAddress ?? null,
    },
    sceneHandle,
    sceneName,
    sceneKind,
    parentObjectAddress: parentObjectAddress ?? summary.parentObjectAddress ?? null,
    childAddresses: [],
    hierarchyPath: [],
    transform: null,
  };
  entities[summary.objectAddress] = created;
  return created;
}

function ensurePlaceholderEntity(
  entities: SceneEntityMap,
  objectAddress: string,
  name: string,
  sceneHandle: number | null,
  sceneName: string | null,
  sceneKind: RuntimeSceneKind | null,
  parentObjectAddress: string | null,
) {
  return ensureEntity(
    entities,
    createPlaceholderSummary(objectAddress, name, parentObjectAddress),
    sceneHandle,
    sceneName,
    sceneKind,
    parentObjectAddress,
  );
}

function linkEntity(entities: SceneEntityMap, parentObjectAddress: string, childObjectAddress: string) {
  const parent = entities[parentObjectAddress];
  const child = entities[childObjectAddress];
  if (!parent || !child) {
    return;
  }

  if (!parent.childAddresses.includes(childObjectAddress)) {
    parent.childAddresses.push(childObjectAddress);
  }

  child.parentObjectAddress = parentObjectAddress;
  child.summary = {
    ...child.summary,
    parentObjectAddress,
  };
  child.sceneHandle = child.sceneHandle ?? parent.sceneHandle;
  child.sceneName = child.sceneName ?? parent.sceneName;
  child.sceneKind = child.sceneKind ?? parent.sceneKind;
}

function replaceChildLinks(
  entities: SceneEntityMap,
  parentObjectAddress: string,
  children: RuntimeSceneNodeSummary[],
  sceneHandle: number | null,
  sceneName: string | null,
  sceneKind: RuntimeSceneKind | null,
) {
  const parent = ensurePlaceholderEntity(
    entities,
    parentObjectAddress,
    parentObjectAddress,
    sceneHandle,
    sceneName,
    sceneKind,
    null,
  );

  parent.childAddresses = [];
  children.forEach((child) => {
    ensureEntity(
      entities,
      child,
      sceneHandle ?? parent.sceneHandle,
      sceneName ?? parent.sceneName,
      sceneKind ?? parent.sceneKind,
      parentObjectAddress,
    );
    linkEntity(entities, parentObjectAddress, child.objectAddress);
  });
}

function buildCatalogEntities(entities: SceneEntityMap, sceneWorkspace: SceneWorkspaceState) {
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  scenes.forEach((scene) => {
    scene.roots.forEach((root) => {
      const entity = ensureEntity(
        entities,
        root,
        scene.sceneHandle,
        scene.name,
        scene.kind,
        null,
      );
      entity.parentObjectAddress = null;
      entity.summary = {
        ...entity.summary,
        parentObjectAddress: null,
      };
    });
  });
}

function buildHeaderEntities(
  entities: SceneEntityMap,
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>,
) {
  Object.values(headerTaskByAddress).forEach((taskState) => {
    const header = taskState.header;
    if (!header) {
      return;
    }

    const sceneHandle = header.sceneHandle ?? null;
    const sceneName = header.sceneName ?? null;
    const sceneKind = header.sceneKind ?? null;
    let previousAddress: string | null = null;

    header.hierarchyPath.forEach((entry) => {
      const summary = entry.objectAddress === header.object.objectAddress
        ? header.object
        : header.parent?.objectAddress === entry.objectAddress
          ? header.parent
          : createPlaceholderSummary(entry.objectAddress, entry.name, previousAddress);
      const entity = ensureEntity(
        entities,
        summary,
        sceneHandle,
        sceneName,
        sceneKind,
        previousAddress,
      );
      if (previousAddress) {
        linkEntity(entities, previousAddress, entry.objectAddress);
      }
      previousAddress = entity.objectAddress;
    });

    if (header.parent) {
      ensureEntity(
        entities,
        header.parent,
        sceneHandle,
        sceneName,
        sceneKind,
        header.parent.parentObjectAddress,
      );
      linkEntity(entities, header.parent.objectAddress, header.object.objectAddress);
    }

    const objectEntity = ensureEntity(
      entities,
      header.object,
      sceneHandle,
      sceneName,
      sceneKind,
      header.object.parentObjectAddress,
    );
    objectEntity.hierarchyPath = header.hierarchyPath;
    objectEntity.transform = header.transform;
    objectEntity.sceneHandle = sceneHandle;
    objectEntity.sceneName = sceneName;
    objectEntity.sceneKind = sceneKind;

    if (!header.parent && previousAddress && previousAddress !== header.object.objectAddress) {
      linkEntity(entities, previousAddress, header.object.objectAddress);
    }
  });
}

function buildChildrenEntities(
  entities: SceneEntityMap,
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>,
) {
  Object.values(childTaskByParent).forEach((taskState) => {
    if (!taskState.children.length && taskState.totalCount !== 0) {
      return;
    }

    const parent = entities[taskState.parentObjectAddress] ?? ensurePlaceholderEntity(
      entities,
      taskState.parentObjectAddress,
      taskState.parentObjectAddress,
      null,
      null,
      null,
      null,
    );

    replaceChildLinks(
      entities,
      taskState.parentObjectAddress,
      taskState.children,
      parent.sceneHandle,
      parent.sceneName,
      parent.sceneKind,
    );
  });
}

export function buildSceneEntityMap(args: {
  sceneWorkspace: SceneWorkspaceState;
  childTaskByParent: Record<string, RuntimeSceneObjectChildrenTaskState>;
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>;
}): SceneEntityMap {
  const entities: SceneEntityMap = {};

  buildCatalogEntities(entities, args.sceneWorkspace);
  buildHeaderEntities(entities, args.headerTaskByAddress);
  buildChildrenEntities(entities, args.childTaskByParent);

  Object.values(entities).forEach((entity) => {
    const childCount = Math.max(entity.summary.childCount, entity.childAddresses.length);
    entity.summary = {
      ...entity.summary,
      childCount,
      hasChildren: entity.summary.hasChildren || childCount > 0,
      parentObjectAddress: entity.parentObjectAddress,
    };
  });

  return entities;
}

export function buildSceneChildrenByParent(entityByAddress: SceneEntityMap) {
  return Object.fromEntries(
    Object.values(entityByAddress)
      .filter((entity) => entity.childAddresses.length > 0)
      .map((entity) => [
        entity.objectAddress,
        entity.childAddresses
          .map((childAddress) => entityByAddress[childAddress]?.summary ?? null)
          .filter((summary): summary is RuntimeSceneNodeSummary => summary != null),
      ]),
  ) as Record<string, RuntimeSceneNodeSummary[]>;
}

export function buildSceneInspectors(args: {
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>;
  headerTaskByAddress: Record<string, RuntimeSceneObjectHeaderTaskState>;
  componentsTaskByAddress: Record<string, RuntimeSceneObjectComponentsTaskState>;
}): Record<string, RuntimeSceneObjectInspectorSnapshot> {
  const inspectors: Record<string, RuntimeSceneObjectInspectorSnapshot> = {};

  Object.entries(args.headerTaskByAddress).forEach(([objectAddress, taskState]) => {
    const snapshot = buildInspectorSnapshot(
      taskState,
      args.childrenByParent[objectAddress] ?? [],
      args.componentsTaskByAddress[objectAddress]?.components ?? [],
    );
    if (!snapshot) {
      return;
    }

    inspectors[objectAddress] = syncInspectorComponentCount(
      snapshot,
      args.componentsTaskByAddress[objectAddress]?.totalCount,
    );
  });

  return inspectors;
}
