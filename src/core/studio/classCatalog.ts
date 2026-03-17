import type { ClassInfo, ClassSummary, ImageInfo } from '../../types';
import type {
  ClassBinding,
  ClassInfoCatalog,
  ClassInfoSelection,
  PendingClassNodeRequest,
  StudioClassCatalogEntry,
} from './types';

export function createClassInfoItemId(prefix: string, value: string) {
  return `${prefix}:${value}`;
}

export function createEmptyClassInfoSelection(): ClassInfoSelection {
  return {
    members: [],
    statics: [],
    functions: [],
  };
}

export function createClassInfoCatalogFromClassInfo(classInfo: ClassInfo): ClassInfoCatalog {
  return {
    members: classInfo.fields.map((field) => ({
      id: createClassInfoItemId('member', field.name),
      label: field.name,
      detail: field.field_type,
    })),
    statics: classInfo.static_fields.map((field) => ({
      id: createClassInfoItemId('static', field.name),
      label: field.name,
      detail: `${field.field_type}${field.address ? ` @ ${field.address}` : ''}`,
    })),
    functions: classInfo.methods.map((method) => ({
      id: createClassInfoItemId('function', method.signature),
      label: method.name,
      detail: method.signature,
    })),
  };
}

export function reconcileClassInfoSelection(
  selection: ClassInfoSelection,
  catalog: ClassInfoCatalog
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
  images: ImageInfo[],
  classesByImage: Record<string, ClassSummary[]>
): StudioClassCatalogEntry[] {
  const entries: StudioClassCatalogEntry[] = [];

  for (const image of images) {
    const classes = classesByImage[image.id] ?? [];
    for (const classSummary of classes) {
      entries.push({
        imageId: image.id,
        classId: classSummary.id,
        fullName: classSummary.full_name,
        name: classSummary.name,
        namespace: classSummary.namespace,
        imageName: image.name,
        searchText: [
          classSummary.full_name,
          classSummary.name,
          classSummary.namespace,
          image.name,
        ]
          .join(' ')
          .toLowerCase(),
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
  classInfo: ClassInfo,
  suggestedPosition?: { x: number; y: number }
): PendingClassNodeRequest {
  return {
    requestId: `${binding.imageId}::${binding.classId}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
    binding,
    availableInfo: createClassInfoCatalogFromClassInfo(classInfo),
    suggestedPosition,
  };
}
