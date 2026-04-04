import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
} from './contracts';
import type { SystemContractVersions } from '@/shared/contracts';
import type { ClassInfoCatalog, PendingClassNodeRequest, StudioClassCatalogEntry } from '@/domain/studio/editor';
import type { StableId } from '../contracts/shared-identity';
import type { ResolvedMemberRuntimeValue } from '@/domain/studio/runtime';
import type { AnalysisClassInfo, AnalysisClassSummary, AnalysisImageInfo } from './view-models';

export interface AnalysisWorkspaceContextValue {
  processSession: ProcessSession | null;
  attachError: string | null;
  analysisSnapshot: AnalysisSnapshot | null;
  contractVersions: SystemContractVersions | null;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  images: AnalysisImageInfo[];
  classesByImage: Record<string, AnalysisClassSummary[]>;
  classDetailsByStableId: Record<string, AnalysisClassInfo>;
  studioClassCatalogEntries: StudioClassCatalogEntry[];
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  staticFieldAddressByClassAndMember: Record<string, Record<string, string | null>>;
  pendingClassNode: PendingClassNodeRequest | null;
  clearPendingClassNode: () => void;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  ensureRuntimeInstanceFieldsLoaded: (classStableId: StableId, instanceAddress: string) => void;
  runtimeMemberValuesByClassAndAddress: Record<string, Record<string, Record<string, ResolvedMemberRuntimeValue>>>;
}