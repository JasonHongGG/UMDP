export type StableId = string & { readonly __stableId: unique symbol };

export type StableIdKind = 'image' | 'class' | 'field' | 'method' | 'symbol' | 'binding';

function normalizeSegment(segment: string) {
  return segment.trim().replace(/[|\\]/g, '_');
}

export function createStableId(kind: StableIdKind, parts: readonly string[]): StableId {
  const normalized = parts.map((part) => normalizeSegment(part));
  return `${kind}:${normalized.join('|')}` as StableId;
}

export interface ImageIdentitySeed {
  imageName: string;
  imagePath: string;
}

export interface ClassIdentitySeed {
  imageStableId: StableId;
  namespace: string;
  className: string;
}

export interface FieldIdentitySeed {
  classStableId: StableId;
  fieldName: string;
  fieldType: string;
  fieldKind: 'instance' | 'static';
}

export interface MethodIdentitySeed {
  classStableId: StableId;
  methodName: string;
  signature: string;
}

export interface ParameterSymbolIdentitySeed {
  nodeInstanceId: string;
  symbolName: string;
}

export function createImageStableId(seed: ImageIdentitySeed) {
  return createStableId('image', [seed.imageName, seed.imagePath]);
}

export function createClassStableId(seed: ClassIdentitySeed) {
  return createStableId('class', [seed.imageStableId, seed.namespace, seed.className]);
}

export function createFieldStableId(seed: FieldIdentitySeed) {
  return createStableId('field', [seed.classStableId, seed.fieldKind, seed.fieldName, seed.fieldType]);
}

export function createMethodStableId(seed: MethodIdentitySeed) {
  return createStableId('method', [seed.classStableId, seed.methodName, seed.signature]);
}

export function createParameterSymbolStableId(seed: ParameterSymbolIdentitySeed) {
  return createStableId('symbol', [seed.nodeInstanceId, seed.symbolName]);
}