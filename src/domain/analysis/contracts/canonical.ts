import type { StableId } from '../../contracts/shared-identity';

export type RuntimeFlavor = 'mono' | 'il2cpp' | 'unknown';

export interface ProcessInfo {
  pid: number;
  name: string;
}

export interface ProcessSession {
  pid: number;
  processName: string;
  exePath: string;
  dataDir: string | null;
  managedDir: string | null;
  runtime: RuntimeFlavor;
}

export interface AnalysisSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  process: ProcessSession | null;
  images: ImageDescriptor[];
  classes: Record<StableId, ClassDescriptor>;
  imageClassIndex: Record<StableId, StableId[]>;
}

export interface RuntimeOverlaySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  classes: Record<StableId, RuntimeClassOverlayDescriptor>;
}

export interface ImageDescriptor {
  stableId: StableId;
  legacyImageId: string;
  name: string;
  path: string;
}

export interface InheritanceDescriptor {
  name: string;
}

export interface FieldDescriptor {
  stableId: StableId;
  legacyFieldName: string;
  name: string;
  fieldType: string;
  offset: string | null;
}

export interface StaticFieldDescriptor extends FieldDescriptor {
  address: string | null;
  value: string | null;
}

export interface MethodParameterDescriptor {
  position: number;
  name: string;
  typeName: string;
}

export interface MethodDescriptor {
  stableId: StableId;
  name: string;
  signature: string;
  returnType: string;
  parameters: MethodParameterDescriptor[];
  isStatic: boolean;
  tags: string[];
}

export interface RuntimeResolvedFieldDescriptor extends FieldDescriptor {
  address: string | null;
  value: string | null;
}

export interface ClassDescriptor {
  stableId: StableId;
  legacyClassId: string;
  legacyImageId: string;
  imageStableId: StableId;
  name: string;
  namespace: string;
  fullName: string;
  inheritance: InheritanceDescriptor[];
  fields: FieldDescriptor[];
  staticFields: StaticFieldDescriptor[];
  methods: MethodDescriptor[];
}

export interface RuntimeClassOverlayDescriptor {
  classStableId: StableId;
  fields: FieldDescriptor[];
  staticFields: StaticFieldDescriptor[];
}

export interface RuntimeInstanceFieldSnapshot {
  classStableId: StableId;
  instanceAddress: string;
  fields: RuntimeResolvedFieldDescriptor[];
}

export type RuntimeInvokeArgumentKind = 'null' | 'boolean' | 'number' | 'string';

export interface RuntimeMethodInvokeArgument {
  name: string;
  typeName: string;
  valueKind: RuntimeInvokeArgumentKind;
  value: string | null;
}

export interface RuntimeMethodInvokeRequest {
  classStableId: StableId;
  methodStableId: StableId;
  instanceAddress: string | null;
  arguments: RuntimeMethodInvokeArgument[];
}

export interface RuntimeMethodInvokeValue {
  kind: string;
  value: string | null;
  objectAddress: string | null;
}

export interface RuntimeMethodInvokeResult {
  classStableId: StableId;
  methodStableId: StableId;
  methodName: string;
  methodSignature: string;
  returnType: string;
  success: boolean;
  error: string | null;
  exception: string | null;
  result: RuntimeMethodInvokeValue | null;
}