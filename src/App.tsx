import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ClassInfo, FieldInfo, RuntimeClassOverlayResponse, StaticFieldInfo } from './types';
import { ScanSearch, Binary, Database } from 'lucide-react';

import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import { SidebarTools } from './components/features/SidebarTools';
import { GlobalSearchSidebar } from './components/features/GlobalSearchSidebar';
import { AssembliesColumn } from './components/features/AssembliesColumn';
import { ClassesColumn } from './components/features/ClassesColumn';
import { InspectorTabBar } from './components/features/InspectorTabBar';
import ClassInspectorApp from './components/features/ClassInspectorApp';

import { useProcessAttachment } from './hooks/useProcessAttachment';
import { useMetadata } from './hooks/useMetadata';
import { useTabs } from './hooks/useTabs';
import { useGlobalSearch } from './hooks/useGlobalSearch';
import './styles.css';

export default function App() {
  const { fetchMetadata, resetMetadata, images, classesByImage, classDetailsByKey, selectedImageId, setSelectedImageId, loadingImages, setLoadingImages, classLookupMap } = useMetadata();
  const { tabs, activeTabIndex, setActiveTabIndex, openTabForClass, handleCloseTab, resetTabs } = useTabs();

  const { attached, error } = useProcessAttachment(
    () => { setLoadingImages(true); },
    () => {
      resetMetadata();
      resetTabs();
      setRuntimeStaticFieldsByKey({});
      setRuntimeFieldsByKey({});
      setRuntimeFieldErrorByKey({});
      fetchMetadata();
    },
    (err) => {
      resetMetadata();
      resetTabs();
      setRuntimeStaticFieldsByKey({});
      setRuntimeFieldsByKey({});
      setRuntimeFieldErrorByKey({});
    }
  );

  const [runtimeStaticFieldsByKey, setRuntimeStaticFieldsByKey] = useState<Record<string, StaticFieldInfo[] | null>>({});
  const [runtimeFieldsByKey, setRuntimeFieldsByKey] = useState<Record<string, FieldInfo[] | null>>({});
  const [runtimeFieldErrorByKey, setRuntimeFieldErrorByKey] = useState<Record<string, string | null>>({});
  const [loadingRuntimeByKey, setLoadingRuntimeByKey] = useState<Record<string, boolean>>({});

  const [imageSearch, setImageSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const [pendingScrollImageId, setPendingScrollImageId] = useState<string | null>(null);
  const [pendingScrollClassId, setPendingScrollClassId] = useState<string | null>(null);

  const tabBarRef = useRef<HTMLDivElement>(null);
  const imageListRef = useRef<HTMLDivElement>(null);
  const classListRef = useRef<HTMLDivElement>(null);
  const fetchingRuntimeRef = useRef<Set<string>>(new Set());

  const activeTab = activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : null;

  const {
    isGlobalSearchOpen, setIsGlobalSearchOpen,
    globalSearchMode, setGlobalSearchMode,
    globalSearchQuery, setGlobalSearchQuery,
    isGlobalSearching, globalSearchResults,
    handleGlobalSearchResultClick
  } = useGlobalSearch(
    classDetailsByKey,
    images,
    classLookupMap,
    classesByImage,
    activeTab ? { imageId: activeTab.imageId, classId: activeTab.classId } : null,
    openTabForClass,
    setSelectedImageId,
    setPendingScrollImageId,
    setPendingScrollClassId
  );

  const openSelector = async () => {
    const selector = await WebviewWindow.getByLabel('process-selector');
    if (selector) {
      await selector.show();
      await selector.setFocus();
      await selector.emit('refresh-processes');
    }
  };

  const filteredImages = useMemo(() => {
    if (!images.length) return [];
    const keyword = imageSearch.trim().toLowerCase();
    return images.filter((image) => image.name.toLowerCase().includes(keyword) || image.path.toLowerCase().includes(keyword));
  }, [imageSearch, images]);

  const selectedImage = useMemo(() => {
    return filteredImages.find((image) => image.id === selectedImageId)
      ?? images.find((image) => image.id === selectedImageId)
      ?? null;
  }, [filteredImages, images, selectedImageId]);

  const currentClasses = useMemo(() => {
    if (!selectedImageId) return [];
    return classesByImage[selectedImageId] ?? [];
  }, [classesByImage, selectedImageId]);

  const filteredClasses = useMemo(() => {
    if (!currentClasses.length) return [];
    const keyword = classSearch.trim().toLowerCase();
    return currentClasses.filter((item) => item.full_name.toLowerCase().includes(keyword));
  }, [classSearch, currentClasses]);

  const selectedClass = useMemo<ClassInfo | null>(() => {
    if (!activeTab) return null;
    return classDetailsByKey[`${activeTab.imageId}::${activeTab.classId}`] ?? null;
  }, [classDetailsByKey, activeTab]);

  useEffect(() => {
    if (!selectedImage && selectedImageId !== null) setSelectedImageId(null);
  }, [selectedImage, selectedImageId, setSelectedImageId]);

  useEffect(() => {
    if (selectedImageId && !images.some((image) => image.id === selectedImageId)) setSelectedImageId(null);
  }, [images, selectedImageId, setSelectedImageId]);

  useEffect(() => {
    if (!attached || !activeTab || !selectedClass) {
      return;
    }
    const cacheKey = `${activeTab.imageId}::${activeTab.classId}`;

    if (attached.runtime !== 'Mono') {
      setRuntimeFieldErrorByKey(curr => ({ ...curr, [cacheKey]: 'Runtime static field resolution is currently available for Mono targets only.' }));
      return;
    }

    if (runtimeStaticFieldsByKey[cacheKey] !== undefined || fetchingRuntimeRef.current.has(cacheKey)) return;

    fetchingRuntimeRef.current.add(cacheKey);
    setLoadingRuntimeByKey(curr => ({ ...curr, [cacheKey]: true }));

    invoke<RuntimeClassOverlayResponse>('get_runtime_static_fields', {
      imageId: activeTab.imageId,
      classNamespace: selectedClass.namespace,
      className: selectedClass.name,
    })
      .then((response) => {
        setRuntimeStaticFieldsByKey(curr => ({ ...curr, [cacheKey]: response.static_fields }));
        setRuntimeFieldsByKey(curr => ({ ...curr, [cacheKey]: response.fields }));
      })
      .catch((invokeError) => {
        setRuntimeStaticFieldsByKey(curr => ({ ...curr, [cacheKey]: null }));
        setRuntimeFieldsByKey(curr => ({ ...curr, [cacheKey]: null }));
        setRuntimeFieldErrorByKey(curr => ({ ...curr, [cacheKey]: String(invokeError) }));
      })
      .finally(() => {
        fetchingRuntimeRef.current.delete(cacheKey);
        setLoadingRuntimeByKey(curr => ({ ...curr, [cacheKey]: false }));
      });
  }, [attached, selectedClass, activeTab, runtimeStaticFieldsByKey]);

  const activeCacheKey = activeTab ? `${activeTab.imageId}::${activeTab.classId}` : '';
  const displayStaticFields = activeTab ? (runtimeStaticFieldsByKey[activeCacheKey] ?? selectedClass?.static_fields ?? []) : [];
  const displayFields = activeTab ? (runtimeFieldsByKey[activeCacheKey] ?? selectedClass?.fields ?? []) : [];
  const activeRuntimeFieldError = runtimeFieldErrorByKey[activeCacheKey];
  const isLoadingRuntimeFields = loadingRuntimeByKey[activeCacheKey] ?? false;

  useEffect(() => {
    if (pendingScrollImageId && pendingScrollClassId && selectedImageId === pendingScrollImageId) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (imageListRef.current) {
            const activeImage = imageListRef.current.querySelector(`[data-id="${pendingScrollImageId}"]`);
            if (activeImage) activeImage.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          if (classListRef.current) {
            const activeClass = classListRef.current.querySelector(`[data-id="${pendingScrollClassId}"]`);
            if (activeClass) activeClass.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
        }, 50);
      });
      setPendingScrollImageId(null);
      setPendingScrollClassId(null);
    }
  }, [selectedImageId, currentClasses, pendingScrollImageId, pendingScrollClassId]);

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
        attachedProcess={attached ? `${attached.process_name} (${attached.process_id})` : null}
        onOpenSelector={openSelector}
      />

      <div className="flex-1 flex overflow-hidden">
        <SidebarTools isGlobalSearchOpen={isGlobalSearchOpen} setIsGlobalSearchOpen={setIsGlobalSearchOpen} />

        <GlobalSearchSidebar
          isGlobalSearchOpen={isGlobalSearchOpen}
          setIsGlobalSearchOpen={setIsGlobalSearchOpen}
          globalSearchMode={globalSearchMode}
          setGlobalSearchMode={setGlobalSearchMode}
          globalSearchQuery={globalSearchQuery}
          setGlobalSearchQuery={setGlobalSearchQuery}
          isGlobalSearching={isGlobalSearching}
          globalSearchResults={globalSearchResults}
          handleGlobalSearchResultClick={handleGlobalSearchResultClick}
        />

        <AssembliesColumn
          images={images}
          filteredImages={filteredImages}
          selectedImage={selectedImage}
          setSelectedImageId={setSelectedImageId}
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
            if (!selectedImage) return;
            openTabForClass({
              imageId: selectedImage.id,
              classId: item.id,
              name: item.name,
              namespace: item.namespace,
              imageName: selectedImage.name,
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

          {error ? (
            <div className="m-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono flex items-center gap-2 z-10">
              <Binary size={16} /> {error}
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
              navigateToType={(typeName) => {
                const entry = classLookupMap.get(typeName);
                if (entry) openTabForClass(entry);
              }}
              runtimeStaticFields={displayStaticFields}
              runtimeFields={displayFields}
              isLoadingRuntimeFields={isLoadingRuntimeFields}
              runtimeFieldError={activeRuntimeFieldError}
              activeTabId={`${activeTab?.imageId}::${activeTab?.classId}`}
            />
          )}
        </div>
      </div>

      <div className="h-7 border-t border-[#1c2838] bg-[#05080c] flex items-center px-4 justify-between text-[10px] text-slate-500 shrink-0 select-none z-20 relative">
        <div className="flex items-center gap-4 uppercase tracking-wider font-semibold">
          <span className="flex items-center gap-1">
            <Binary size={12} className={attached ? "text-cyan-500" : "text-slate-600"} />
            {attached?.exe_path ? "Attached" : "Detached"}
          </span>
          {attached && (
            <span className="flex items-center gap-1">
              <Database size={12} className="text-blue-500" />
              {attached.runtime} Runtime
            </span>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
