import type { ClassDescriptor, RuntimeClassOverlayDescriptor } from '../analysis/contracts';
import type { AnalysisClassSummary, AnalysisImageInfo } from '../analysis/view-models';
import type { StableId } from '../contracts/shared-identity';
import { formatHexAddress } from '@/core/addressFormat';

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
  suggestedPosition?: { x: number; y: number };
}

export interface StudioClassCatalogEntry extends ClassBinding {
  searchText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeClassInfoFieldDescriptor(value: unknown): ClassInfoFieldDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || typeof value.name !== 'string'
    || typeof value.typeName !== 'string'
    || (value.offset !== null && typeof value.offset !== 'string')
    || (value.address !== null && typeof value.address !== 'string')
    || (value.value !== null && typeof value.value !== 'string')
    || typeof value.isStatic !== 'boolean'
  ) {
    return null;
  }

  return {
    id: value.id as StableId,
    label: value.label,
    name: value.name,
    typeName: value.typeName,
    offset: value.offset,
    address: value.address,
    value: value.value,
    isStatic: value.isStatic,
    detail: typeof value.detail === 'string' ? value.detail : undefined,
  };
}

function normalizeClassInfoMethodParameterDescriptor(value: unknown): ClassInfoMethodParameterDescriptor | null {
  if (!isRecord(value) || typeof value.position !== 'number' || typeof value.name !== 'string' || typeof value.typeName !== 'string') {
    return null;
  }

  return {
    position: value.position,
    name: value.name,
    typeName: value.typeName,
  };
}

function normalizeClassInfoMethodDescriptor(value: unknown): ClassInfoMethodDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || typeof value.name !== 'string'
    || typeof value.signature !== 'string'
    || typeof value.returnType !== 'string'
    || typeof value.isStatic !== 'boolean'
  ) {
    return null;
  }

  return {
    id: value.id as StableId,
    label: value.label,
    name: value.name,
    signature: value.signature,
    returnType: value.returnType,
    parameters: Array.isArray(value.parameters)
      ? value.parameters.flatMap((parameter) => {
        const normalized = normalizeClassInfoMethodParameterDescriptor(parameter);
        return normalized ? [normalized] : [];
      })
      : [],
    isStatic: value.isStatic,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    detail: typeof value.detail === 'string' ? value.detail : undefined,
  };
}

export function createEmptyClassInfoSelection(): ClassInfoSelection {
  return {
    members: [],
    statics: [],
    functions: [],
  };
}

export function normalizeClassInfoCatalog(value: unknown): ClassInfoCatalog {
  const catalog = isRecord(value) ? value : {};

  return {
    members: Array.isArray(catalog.members)
      ? catalog.members.flatMap((entry) => {
        const normalized = normalizeClassInfoFieldDescriptor(entry);
        return normalized ? [normalized] : [];
      })
      : [],
    statics: Array.isArray(catalog.statics)
      ? catalog.statics.flatMap((entry) => {
        const normalized = normalizeClassInfoFieldDescriptor(entry);
        return normalized ? [normalized] : [];
      })
      : [],
    functions: Array.isArray(catalog.functions)
      ? catalog.functions.flatMap((entry) => {
        const normalized = normalizeClassInfoMethodDescriptor(entry);
        return normalized ? [normalized] : [];
      })
      : [],
  };
}

export function createClassInfoCatalogFromClassDescriptor(
  classInfo: ClassDescriptor,
  runtimeOverlay?: RuntimeClassOverlayDescriptor,
): ClassInfoCatalog {
  const fields = runtimeOverlay?.fields ?? classInfo.fields;
  const staticFields = runtimeOverlay?.staticFields ?? classInfo.staticFields;

  return normalizeClassInfoCatalog({
    members: fields.map((field) => ({
      id: field.stableId,
      label: field.name,
      name: field.name,
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
  });
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
  suggestedPosition?: { x: number; y: number },
): PendingClassNodeRequest {
  return {
    requestId: `${binding.imageStableId}::${binding.classStableId}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
    binding,
    suggestedPosition,
  };
}