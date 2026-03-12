export interface ProcessInfo {
  pid: number;
  name: string;
}

export interface AttachResponse {
  attached: boolean;
  process_name: string;
  process_id: number;
  exe_path: string;
  managed_dir: string | null;
  runtime: string;
}

export interface DumpAllResponse {
  images: ImageInfo[];
  classesByImage: Record<string, ClassSummary[]>;
  classDetails: Record<string, ClassInfo>;
}

export interface InheritanceNode {
  name: string;
}

export interface StaticFieldInfo {
  name: string;
  field_type: string;
  address: string | null;
  value: string | null;
}

export interface FieldInfo {
  offset: string | null;
  name: string;
  field_type: string;
}

export interface MethodInfo {
  name: string;
  signature: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  namespace: string;
  full_name: string;
  inheritance: InheritanceNode[];
  static_fields: StaticFieldInfo[];
  fields: FieldInfo[];
  methods: MethodInfo[];
}

export interface ImageInfo {
  id: string;
  name: string;
  path: string;
}

export interface ClassSummary {
  id: string;
  name: string;
  namespace: string;
  full_name: string;
}

export interface RuntimeClassOverlayResponse {
  static_fields: StaticFieldInfo[];
  fields: FieldInfo[];
}

export interface GlobalSearchResult {
  imageId: string;
  classId: string;
  imageName: string;
  className: string;
  matchType: 'Class' | 'Field' | 'StaticField' | 'Method';
  matchText: string;
}
