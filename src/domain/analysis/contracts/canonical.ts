import type { StableId } from '../../contracts/shared-identity';

export type RuntimeFlavor = 'mono' | 'il2cpp' | 'unknown';

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

export interface MethodDescriptor {
  stableId: StableId;
  name: string;
  signature: string;
  tags: string[];
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