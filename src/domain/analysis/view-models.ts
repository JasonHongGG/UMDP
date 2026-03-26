import type { StableId } from '../contracts/shared-identity';
import type { ClassDescriptor, ImageDescriptor, RuntimeClassOverlayDescriptor } from './contracts';
import { formatHexAddress } from '@/core/addressFormat';

export type AnalysisImageInfo = ImageDescriptor;

export interface AnalysisClassSummary {
  stableId: StableId;
  imageStableId: StableId;
  name: string;
  namespace: string;
  fullName: string;
  imageName: string;
}

export interface AnalysisFieldInfo {
  offset: string | null;
  name: string;
  fieldType: string;
}

export interface AnalysisStaticFieldInfo extends AnalysisFieldInfo {
  address: string | null;
  value: string | null;
}

export interface AnalysisMethodInfo {
  name: string;
  signature: string;
  returnType: string;
  parameters: Array<{ position: number; name: string; typeName: string }>;
  isStatic: boolean;
  tags: string[];
}

export interface AnalysisClassInfo {
  stableId: StableId;
  imageStableId: StableId;
  name: string;
  namespace: string;
  fullName: string;
  inheritance: Array<{ name: string }>;
  staticFields: AnalysisStaticFieldInfo[];
  fields: AnalysisFieldInfo[];
  methods: AnalysisMethodInfo[];
}

export interface GlobalSearchResult {
  imageStableId: StableId;
  classStableId: StableId;
  imageName: string;
  className: string;
  matchType: 'Class' | 'Field' | 'StaticField' | 'Method';
  matchText: string;
  isInherited?: boolean;
}

export interface ClassReferenceResult {
  imageStableId: StableId;
  classStableId: StableId;
  imageName: string;
  className: string;
  matchType: 'Inheritance' | 'Member' | 'Function';
  matchDetail: string;
}

function mapFieldInfo(field: ClassDescriptor['fields'][number] | RuntimeClassOverlayDescriptor['fields'][number]): AnalysisFieldInfo {
  return {
    offset: formatHexAddress(field.offset),
    name: field.name,
    fieldType: field.fieldType,
  };
}

function mapStaticFieldInfo(
  field: ClassDescriptor['staticFields'][number] | RuntimeClassOverlayDescriptor['staticFields'][number],
): AnalysisStaticFieldInfo {
  return {
    offset: formatHexAddress(field.offset),
    name: field.name,
    fieldType: field.fieldType,
    address: formatHexAddress(field.address),
    value: field.value,
  };
}

export function createAnalysisClassSummary(image: ImageDescriptor, descriptor: ClassDescriptor): AnalysisClassSummary {
  return {
    stableId: descriptor.stableId,
    imageStableId: descriptor.imageStableId,
    name: descriptor.name,
    namespace: descriptor.namespace,
    fullName: descriptor.fullName,
    imageName: image.name,
  };
}

export function createAnalysisClassInfo(
  descriptor: ClassDescriptor,
  runtimeOverlay?: RuntimeClassOverlayDescriptor,
): AnalysisClassInfo {
  return {
    stableId: descriptor.stableId,
    imageStableId: descriptor.imageStableId,
    name: descriptor.name,
    namespace: descriptor.namespace,
    fullName: descriptor.fullName,
    inheritance: descriptor.inheritance.map((node) => ({ name: node.name })),
    staticFields: (runtimeOverlay?.staticFields ?? descriptor.staticFields).map(mapStaticFieldInfo),
    fields: (runtimeOverlay?.fields ?? descriptor.fields).map(mapFieldInfo),
    methods: descriptor.methods.map((method) => ({
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
    })),
  };
}