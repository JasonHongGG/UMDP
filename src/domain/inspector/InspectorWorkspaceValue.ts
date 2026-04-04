import type React from 'react';
import type { ClassBinding } from '@/domain/studio/editor';
import type { StableId } from '@/domain/contracts/shared-identity';
import type {
  AnalysisClassInfo,
  AnalysisClassSummary,
  AnalysisFieldInfo,
  AnalysisImageInfo,
  AnalysisStaticFieldInfo,
  ClassReferenceResult,
  GlobalSearchResult,
} from '@/domain/analysis/view-models';
import type { ClassLookupEntry, GlobalSearchMode, InspectorTab, ReferenceMode } from '@/domain/analysis/workspace-types';

export interface InspectorWorkspaceValue {
  attachError: string | null;
  images: AnalysisImageInfo[];
  classLookupMap: Map<string, ClassLookupEntry>;
  selectedImageStableId: StableId | null;
  setSelectedImageStableId: (id: StableId | null) => void;
  loadingImages: boolean;
  imageSearch: string;
  setImageSearch: (value: string) => void;
  classSearch: string;
  setClassSearch: (value: string) => void;
  filteredImages: AnalysisImageInfo[];
  selectedImage: AnalysisImageInfo | null;
  currentClasses: AnalysisClassSummary[];
  filteredClasses: AnalysisClassSummary[];
  tabs: InspectorTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  openTabForClass: (entry: InspectorTab) => void;
  handleCloseTab: (index: number, event: React.MouseEvent) => void;
  activeTab: InspectorTab | null;
  selectedClass: AnalysisClassInfo | null;
  displayStaticFields: AnalysisStaticFieldInfo[];
  displayFields: AnalysisFieldInfo[];
  activeRuntimeFieldError: string | null;
  isLoadingRuntimeFields: boolean;
  isGlobalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
  globalSearchMode: GlobalSearchMode;
  setGlobalSearchMode: (mode: GlobalSearchMode) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  globalSearchResults: GlobalSearchResult[];
  isGlobalSearching: boolean;
  handleGlobalSearchResultClick: (result: GlobalSearchResult) => void;
  isReferenceOpen: boolean;
  setReferenceOpen: (open: boolean) => void;
  referenceSearchMode: ReferenceMode;
  setReferenceSearchMode: (mode: ReferenceMode) => void;
  referenceTargetInput: string;
  setReferenceTargetInput: (value: string) => void;
  referenceTargetError: string | null;
  referenceResults: ClassReferenceResult[];
  isReferenceSearching: boolean;
  executeReferenceSearch: () => void;
  handleReferenceResultClick: (result: ClassReferenceResult) => void;
  setReferenceTargetFromClass: (fullName: string) => void;
  handleAddClassToStudio: (binding: ClassBinding) => void;
  pendingScrollImageStableId: StableId | null;
  pendingScrollClassStableId: StableId | null;
  clearPendingScrollTarget: () => void;
}