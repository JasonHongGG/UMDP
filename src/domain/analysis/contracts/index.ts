export type {
  AnalysisSnapshot,
  ClassDescriptor,
  FieldDescriptor,
  ImageDescriptor,
  MethodDescriptor,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeFlavor,
  RuntimeOverlaySnapshot,
  StaticFieldDescriptor,
} from './canonical';
export type {
  AttachResponse,
  ClassInfo,
  ClassSummary,
  DumpAllResponse,
  FieldInfo,
  ImageInfo,
  InheritanceNode,
  MethodInfo,
  ProcessInfo,
  RuntimeClassOverlayResponse,
  StaticFieldInfo,
} from './external';
export {
  mapAttachResponseToProcessSession,
  mapDumpAllResponseToAnalysisSnapshot,
  mapRuntimeOverlayResponseToSnapshot,
} from './mappers';