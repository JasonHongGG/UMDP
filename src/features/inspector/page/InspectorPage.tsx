import { Binary, ScanSearch } from 'lucide-react';
import { SidebarTools } from '@/features/inspector/components/SidebarTools';
import { GlobalSearchSidebar } from '@/features/inspector/components/GlobalSearchSidebar';
import { ClassReferenceSidebar } from '@/features/inspector/components/ClassReferenceSidebar';
import { AssembliesColumn } from '@/features/inspector/components/AssembliesColumn';
import { ClassesColumn } from '@/features/inspector/components/ClassesColumn';
import { InspectorTabBar } from '@/features/inspector/components/InspectorTabBar';
import ClassInspectorApp from '@/features/inspector/components/ClassInspectorApp';
import { useInspectorWorkspace } from '@/domain/analysis/AnalysisWorkspaceContext';
import { useInspectorPageController } from './useInspectorPageController';

export function InspectorPage() {
  const {
    attachError,
    images,
    classLookupMap,
    selectedImageStableId,
    setSelectedImageStableId,
    loadingImages,
    imageSearch,
    setImageSearch,
    classSearch,
    setClassSearch,
    filteredImages,
    selectedImage,
    currentClasses,
    filteredClasses,
    tabs,
    activeTabIndex,
    setActiveTabIndex,
    openTabForClass,
    handleCloseTab,
    activeTab,
    selectedClass,
    displayStaticFields,
    displayFields,
    activeRuntimeFieldError,
    isLoadingRuntimeFields,
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    globalSearchMode,
    setGlobalSearchMode,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    isGlobalSearching,
    handleGlobalSearchResultClick,
    isReferenceOpen,
    setReferenceOpen,
    referenceSearchMode,
    setReferenceSearchMode,
    referenceTargetInput,
    setReferenceTargetInput,
    referenceTargetError,
    referenceResults,
    isReferenceSearching,
    executeReferenceSearch,
    handleReferenceResultClick,
    setReferenceTargetFromClass,
    handleAddClassToStudio,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
  } = useInspectorWorkspace();

  const { tabBarRef, imageListRef, classListRef } = useInspectorPageController({
    tabsLength: tabs.length,
    activeTabIndex,
    selectedImageStableId,
    currentClasses,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      <SidebarTools
        isGlobalSearchOpen={isGlobalSearchOpen}
        setIsGlobalSearchOpen={setGlobalSearchOpen}
        isReferenceOpen={isReferenceOpen}
        setIsReferenceOpen={setReferenceOpen}
      />

      <GlobalSearchSidebar
        isGlobalSearchOpen={isGlobalSearchOpen}
        setIsGlobalSearchOpen={setGlobalSearchOpen}
        globalSearchMode={globalSearchMode}
        setGlobalSearchMode={setGlobalSearchMode}
        globalSearchQuery={globalSearchQuery}
        setGlobalSearchQuery={setGlobalSearchQuery}
        isGlobalSearching={isGlobalSearching}
        globalSearchResults={globalSearchResults}
        handleGlobalSearchResultClick={handleGlobalSearchResultClick}
      />

      <ClassReferenceSidebar
        isOpen={isReferenceOpen}
        setIsOpen={setReferenceOpen}
        searchMode={referenceSearchMode}
        setSearchMode={setReferenceSearchMode}
        targetInput={referenceTargetInput}
        setTargetInput={setReferenceTargetInput}
        targetError={referenceTargetError}
        results={referenceResults}
        isSearching={isReferenceSearching}
        executeSearch={executeReferenceSearch}
        handleResultClick={handleReferenceResultClick}
      />

      <AssembliesColumn
        images={images}
        filteredImages={filteredImages}
        selectedImage={selectedImage}
        setSelectedImageStableId={setSelectedImageStableId}
        loadingImages={loadingImages}
        imageSearch={imageSearch}
        setImageSearch={setImageSearch}
        imageListRef={imageListRef}
      />

      <ClassesColumn
        images={images}
        selectedImage={selectedImage}
        loadingImages={loadingImages}
        currentClasses={currentClasses}
        filteredClasses={filteredClasses}
        classSearch={classSearch}
        setClassSearch={setClassSearch}
        classListRef={classListRef}
        activeTab={activeTab}
        handleClassClick={(item) => {
          openTabForClass({
            imageStableId: item.imageStableId,
            classStableId: item.stableId,
            name: item.name,
            namespace: item.namespace,
            imageName: item.imageName,
          });
        }}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0f16]/60 backdrop-blur-xl">
        <InspectorTabBar
          tabs={tabs}
          activeTabIndex={activeTabIndex}
          setActiveTabIndex={setActiveTabIndex}
          handleCloseTab={handleCloseTab}
          tabBarRef={tabBarRef}
        />

        {attachError ? (
          <div className="m-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono flex items-center gap-2 z-10">
            <Binary size={16} /> {attachError}
          </div>
        ) : null}

        {!activeTab || !selectedClass ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4 mt-[-60px]">
            <div className="w-16 h-16 rounded-2xl bg-[#0a0f16] flex items-center justify-center border border-[#1c2838] shadow-inner mb-2">
              <ScanSearch size={28} className="opacity-50" />
            </div>
            <h2 className="text-xl font-bold text-slate-300 drop-shadow-md">Class Inspector</h2>
            <p className="max-w-[300px] text-center text-[13px] leading-relaxed drop-shadow">
              Select a class to analyze layout, state, and inheritance.
            </p>
          </div>
        ) : (
          <ClassInspectorApp
            classInfo={selectedClass}
            classLookupMap={classLookupMap}
            navigateToType={(typeName: string) => {
              const entry = classLookupMap.get(typeName);
              if (entry) openTabForClass(entry);
            }}
            runtimeStaticFields={displayStaticFields}
            runtimeFields={displayFields}
            isLoadingRuntimeFields={isLoadingRuntimeFields}
            runtimeFieldError={activeRuntimeFieldError}
            activeTab={activeTab}
            onSetReferenceTarget={setReferenceTargetFromClass}
            onAddToStudio={handleAddClassToStudio}
          />
        )}
      </div>
    </div>
  );
}
