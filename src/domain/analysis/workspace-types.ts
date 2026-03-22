import type { StableId } from '../contracts/shared-identity';

export interface InspectorTab {
  imageStableId: StableId;
  classStableId: StableId;
  name: string;
  namespace: string;
  imageName: string;
}

export type ReferenceMode = 'Inheritance' | 'Member' | 'Function';
export type GlobalSearchMode = 'Class' | 'Field' | 'StaticField' | 'Method';
export type ActivePage = 'inspector' | 'studio';

export interface ClassLookupEntry {
  imageStableId: StableId;
  classStableId: StableId;
  legacyImageId: string;
  legacyClassId: string;
  name: string;
  namespace: string;
  imageName: string;
}