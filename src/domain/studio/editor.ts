import type { ClassDescriptor } from '../analysis/contracts';
import type { AnalysisClassSummary, AnalysisImageInfo } from '../analysis/view-models';
import type { StableId } from '../contracts/shared-identity';

export interface ClassBinding {
  imageStableId: StableId;
  classStableId: StableId;
  fullName: string;
  name: string;
  namespace: string;
  imageName: string;
}

export interface ClassInfoItemDescriptor {
  id: StableId;
  label: string;
  detail?: string;
}

export interface ClassInfoCatalog {
  members: ClassInfoItemDescriptor[];
  statics: ClassInfoItemDescriptor[];
  functions: ClassInfoItemDescriptor[];
}

export interface ClassInfoSelection {
  members: StableId[];
  statics: StableId[];
  functions: StableId[];
}

export interface PendingClassNodeRequest {
  requestId: string;
  binding: ClassBinding;
  availableInfo: ClassInfoCatalog;
  suggestedPosition?: { x: number; y: number };
}

export interface StudioClassCatalogEntry extends ClassBinding {
  searchText: string;
}

export function createEmptyClassInfoSelection(): ClassInfoSelection {
  return {
    members: [],
    statics: [],
    functions: [],
  };
}

export function createClassInfoCatalogFromClassDescriptor(classInfo: ClassDescriptor): ClassInfoCatalog {
  return {
    members: classInfo.fields.map((field) => ({
      id: field.stableId,
      label: field.name,
      detail: field.fieldType,
    })),
    statics: classInfo.staticFields.map((field) => ({
      id: field.stableId,
      label: field.name,
      detail: `${field.fieldType}${field.address ? ` @ ${field.address}` : ''}`,
    })),
    functions: classInfo.methods.map((method) => ({
      id: method.stableId,
      label: method.name,
      detail: method.signature,
    })),
  };
}

export function reconcileClassInfoSelection(
  selection: ClassInfoSelection,
  catalog: ClassInfoCatalog,
): ClassInfoSelection {
  const memberIds = new Set(catalog.members.map((item) => item.id));
  const staticIds = new Set(catalog.statics.map((item) => item.id));
  const functionIds = new Set(catalog.functions.map((item) => item.id));

  return {
    members: selection.members.filter((itemId) => memberIds.has(itemId)),
    statics: selection.statics.filter((itemId) => staticIds.has(itemId)),
    functions: selection.functions.filter((itemId) => functionIds.has(itemId)),
  };
}

export function buildStudioClassCatalog(
  images: AnalysisImageInfo[],
  classesByImage: Record<string, AnalysisClassSummary[]>,
): StudioClassCatalogEntry[] {
  const entries: StudioClassCatalogEntry[] = [];

  for (const image of images) {
    const classes = classesByImage[image.stableId] ?? [];
    for (const classSummary of classes) {
      entries.push({
        imageStableId: image.stableId,
        classStableId: classSummary.stableId,
        fullName: classSummary.fullName,
        name: classSummary.name,
        namespace: classSummary.namespace,
        imageName: image.name,
        searchText: [classSummary.fullName, classSummary.name, classSummary.namespace, image.name].join(' ').toLowerCase(),
      });
    }
  }

  return entries.sort((left, right) => {
    if (left.imageName !== right.imageName) {
      return left.imageName.localeCompare(right.imageName);
    }

    if (left.namespace !== right.namespace) {
      return left.namespace.localeCompare(right.namespace);
    }

    return left.name.localeCompare(right.name);
  });
}

export function filterStudioClassCatalog(entries: StudioClassCatalogEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => entry.searchText.includes(normalized));
}

export function createPendingClassNodeRequest(
  binding: ClassBinding,
  availableInfo: ClassInfoCatalog,
  suggestedPosition?: { x: number; y: number },
): PendingClassNodeRequest {
  return {
    requestId: `${binding.imageStableId}::${binding.classStableId}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
    binding,
    availableInfo,
    suggestedPosition,
  };
}