import type { BaseNodeData } from '../../core/studio/types';
import type { StableId } from '../../domain/contracts/shared-identity';
import {
  parseClassNodeDocumentState,
  type ClassBindingReference,
  type ClassExportSelection,
  type ClassNodeDocumentState,
  type ExpressionSource,
} from '../../domain/studio/contracts';
import { createClassInfoEnvelope } from '../../core/studio/contracts';
import {
  createEmptyClassInfoSelection,
  reconcileClassInfoSelection,
  type ClassBinding,
  type ClassInfoCatalog,
  type ClassInfoSelection,
} from '../../domain/studio/editor';

export interface ClassNodeData extends BaseNodeData {
  binding: ClassBinding | null;
  instanceSource: ExpressionSource | null;
  availableInfo: ClassInfoCatalog;
  infoSelection: ClassInfoSelection;
}

export function createEmptyCatalog(): ClassInfoCatalog {
  return {
    members: [],
    statics: [],
    functions: [],
  };
}

export function createClassNodeData(): ClassNodeData {
  return {
    binding: null,
    instanceSource: null,
    availableInfo: createEmptyCatalog(),
    infoSelection: createEmptyClassInfoSelection(),
  };
}

export function hasResolvedExecutionValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

export function toClassBindingReference(binding: ClassBinding | null): ClassBindingReference | null {
  if (!binding) {
    return null;
  }

  return {
    imageStableId: binding.imageStableId,
    classStableId: binding.classStableId,
    fullName: binding.fullName,
    name: binding.name,
    namespace: binding.namespace,
    imageName: binding.imageName,
  };
}

export function fromClassBindingReference(binding: ClassBindingReference | null): ClassBinding | null {
  if (!binding) {
    return null;
  }

  return {
    imageStableId: binding.imageStableId,
    classStableId: binding.classStableId,
    fullName: binding.fullName,
    name: binding.name,
    namespace: binding.namespace,
    imageName: binding.imageName,
  };
}

export function toClassExportSelection(selection: ClassInfoSelection): ClassExportSelection {
  return {
    memberStableIds: selection.members,
    staticStableIds: selection.statics,
    methodStableIds: selection.functions,
  };
}

export function fromClassExportSelection(selection: ClassExportSelection): ClassInfoSelection {
  return {
    members: selection.memberStableIds,
    statics: selection.staticStableIds,
    functions: selection.methodStableIds,
  };
}

export function createClassNodeDocumentState(data: ClassNodeData): ClassNodeDocumentState {
  return {
    classBinding: toClassBindingReference(data.binding),
    exportSelection: toClassExportSelection(data.infoSelection),
  };
}

export function parseClassNodeDataFromDocumentState(baseData: BaseNodeData, instance: import('../../domain/studio/contracts').NodeInstance): ClassNodeData {
  const documentState = parseClassNodeDocumentState(instance.documentState);
  return {
    ...baseData,
    nodeName: instance.displayName,
    binding: fromClassBindingReference(documentState.classBinding),
    instanceSource: (instance.bindings.instanceSource as ExpressionSource | undefined) ?? null,
    availableInfo: createEmptyCatalog(),
    infoSelection: fromClassExportSelection(documentState.exportSelection),
  };
}

export function createInfoPreview(data: ClassNodeData) {
  const selection = reconcileClassInfoSelection(data.infoSelection, data.availableInfo);
  return createClassInfoEnvelope(data.binding, data.availableInfo, selection, null);
}

export function toggleSelectionEntry(selection: StableId[], itemId: StableId) {
  return selection.includes(itemId)
    ? selection.filter((item) => item !== itemId)
    : [...selection, itemId];
}