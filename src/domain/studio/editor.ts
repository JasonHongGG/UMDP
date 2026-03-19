import type { ClassDescriptor, RuntimeClassOverlayDescriptor } from '../analysis/contracts';
import type { AnalysisClassSummary, AnalysisImageInfo } from '../analysis/view-models';
import type { StableId } from '../contracts/shared-identity';
import { formatHexAddress } from '../../core/addressFormat';

export interface ClassBinding {
  imageStableId: StableId;
  classStableId: StableId;
  fullName: string;
  name: string;
  namespace: string;
  imageName: string;
}

export interface ClassInfoFieldDescriptor {
  id: StableId;
  label: string;
  name: string;
  legacyFieldName: string;
  typeName: string;
  offset: string | null;
  address: string | null;
  value: string | null;
  isStatic: boolean;
  detail?: string;
}

export interface ClassInfoMethodParameterDescriptor {
  position: number;
  name: string;
  typeName: string;
}

export interface ClassInfoMethodDescriptor {
  id: StableId;
  label: string;
  name: string;
  signature: string;
  returnType: string;
  parameters: ClassInfoMethodParameterDescriptor[];
  isStatic: boolean;
  tags: string[];
  detail?: string;
}

export interface ClassInfoCatalog {
  members: ClassInfoFieldDescriptor[];
  statics: ClassInfoFieldDescriptor[];
  functions: ClassInfoMethodDescriptor[];
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

export function createClassInfoCatalogFromClassDescriptor(
  classInfo: ClassDescriptor,
  runtimeOverlay?: RuntimeClassOverlayDescriptor,
): ClassInfoCatalog {
  const fields = runtimeOverlay?.fields ?? classInfo.fields;
  const staticFields = runtimeOverlay?.staticFields ?? classInfo.staticFields;

  return {
    members: fields.map((field) => ({
      id: field.stableId,
      label: field.name,
      name: field.name,
      legacyFieldName: field.legacyFieldName,
      typeName: field.fieldType,
      offset: formatHexAddress(field.offset),
      address: null,
      value: null,
      isStatic: false,
      detail: field.fieldType,
    })),
    statics: staticFields.map((field) => ({
      id: field.stableId,
      label: field.name,
      name: field.name,
      legacyFieldName: field.legacyFieldName,
      typeName: field.fieldType,
      offset: formatHexAddress(field.offset),
      address: formatHexAddress(field.address),
      value: field.value,
      isStatic: true,
      detail: `${field.fieldType}${formatHexAddress(field.address) ? ` @ ${formatHexAddress(field.address)}` : ''}`,
    })),
    functions: classInfo.methods.map((method) => ({
      id: method.stableId,
      label: method.name,
      name: method.name,
      signature: method.signature,
      returnType: method.returnType,
      parameters: method.parameters.map((parameter) => ({
        position: parameter.position,
        name: parameter.name,
        typeName: parameter.typeName,
      })),
      isStatic: method.isStatic,
      tags: method.tags,
      detail: method.signature,
    })),
  };
}

export function createClassInfoCatalogSignature(catalog: ClassInfoCatalog) {
  return [
    catalog.members.map((item) => item.id).join(','),
    catalog.statics.map((item) => item.id).join(','),
    catalog.functions.map((item) => item.id).join(','),
  ].join('|');
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

export function hasSameClassInfoSelection(left: ClassInfoSelection, right: ClassInfoSelection) {
  return left.members.join(',') === right.members.join(',')
    && left.statics.join(',') === right.statics.join(',')
    && left.functions.join(',') === right.functions.join(',');
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