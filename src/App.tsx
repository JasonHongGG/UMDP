import { useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ScanSearch, Binary, Database } from 'lucide-react';

import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import { SidebarTools } from './components/features/SidebarTools';
import { GlobalSearchSidebar } from './components/features/GlobalSearchSidebar';
import { AssembliesColumn } from './components/features/AssembliesColumn';
import { ClassesColumn } from './components/features/ClassesColumn';
import { InspectorTabBar } from './components/features/InspectorTabBar';
import ClassInspectorApp from './components/features/ClassInspectorApp';
import { ClassReferenceSidebar } from './components/features/ClassReferenceSidebar';
import { StudioPage } from './components/features/StudioPage';
import { AnalysisWorkspaceProvider, useAnalysisWorkspace } from './domain/analysis/AnalysisWorkspaceContext';
import './styles.css';

export default function App() {
  return (
    <AnalysisWorkspaceProvider>
      <AppContent />
    </AnalysisWorkspaceProvider>
  );
}

function AppContent() {
  const {
    processSession,
    attachError,
    images,
    classesByImage,
    classLookupMap,
    selectedImageStableId,
    setSelectedImageStableId,
    loadingImages,
    activePage,
    setActivePage,
    pendingClassNode,
    clearPendingClassNode,
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
    handleOpenInspectorForBinding,
    classInfoCatalogByStableId,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
  } = useAnalysisWorkspace();

  const tabBarRef = useRef<HTMLDivElement>(null);
  const imageListRef = useRef<HTMLDivElement>(null);
  const classListRef = useRef<HTMLDivElement>(null);

  const openSelector = async () => {
    const selector = await WebviewWindow.getByLabel('process-selector');
    if (selector) {
      await selector.show();
      await selector.setFocus();
      await selector.emit('refresh-processes');
    }
  };

  useEffect(() => {
    if (pendingScrollImageStableId && pendingScrollClassStableId && selectedImageStableId === pendingScrollImageStableId) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (imageListRef.current) {
            const activeImage = imageListRef.current.querySelector(`[data-id="${pendingScrollImageStableId}"]`);
            if (activeImage) activeImage.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          if (classListRef.current) {
            const activeClass = classListRef.current.querySelector(`[data-id="${pendingScrollClassStableId}"]`);
            if (activeClass) activeClass.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
        }, 50);
      });
      clearPendingScrollTarget();
    }
  }, [clearPendingScrollTarget, currentClasses, pendingScrollClassStableId, pendingScrollImageStableId, selectedImageStableId]);

  const prevTabsLengthRef = useRef(tabs.length);
  useEffect(() => {
    const isClosing = tabs.length < prevTabsLengthRef.current;
    prevTabsLengthRef.current = tabs.length;

    if (tabBarRef.current && !isClosing) {
      const container = tabBarRef.current;
      const tab = container.querySelector('[data-active="true"]') as HTMLElement;

      if (tab) {
        const scrollOffset = tab.offsetLeft - (container.clientWidth / 2) + (tab.clientWidth / 2);
        container.scrollTo({ left: scrollOffset, behavior: 'smooth' });
      }
    }
  }, [activeTabIndex, tabs.length]);

  return (
    <MainLayout>
      <TopBar
        attachedProcess={processSession ? `${processSession.processName} (${processSession.pid})` : null}
        onOpenSelector={openSelector}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      {activePage === 'inspector' ? (
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
      ) : (
        <StudioPage
          pendingClassNode={pendingClassNode}
          images={images}
          classesByImage={classesByImage}
          classInfoCatalogByStableId={classInfoCatalogByStableId}
          onOpenInspectorForBinding={handleOpenInspectorForBinding}
          onPendingClassNodeHandled={clearPendingClassNode}
        />
      )}

      <div className="h-7 border-t border-[#1c2838] bg-[#05080c] flex items-center px-4 justify-between text-[10px] text-slate-500 shrink-0 select-none z-20 relative">
        <div className="flex items-center gap-4 uppercase tracking-wider font-semibold">
          <span className="flex items-center gap-1">
            <Binary size={12} className={processSession ? "text-cyan-500" : "text-slate-600"} />
            {processSession?.exePath ? "Attached" : "Detached"}
          </span>
          {processSession && (
            <span className="flex items-center gap-1">
              <Database size={12} className="text-blue-500" />
              {processSession.runtime} Runtime
            </span>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
