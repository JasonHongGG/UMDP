import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  Binary, Database, Layers3, Boxes, Target, ChevronRight, ScanSearch, Network, LoaderCircle, Hexagon, X, Activity, Box, List, Type, Variable
} from 'lucide-react';
import type { AttachResponse, ClassInfo, ClassSummary, FieldInfo, ImageInfo, ProcessInfo, RuntimeClassOverlayResponse, StaticFieldInfo, DumpAllResponse } from './types';
import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import './styles.css';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface InspectorTab {
  imageId: string;
  classId: string;
  name: string;
  namespace: string;
  imageName: string;
}

export default function App() {
  const [attached, setAttached] = useState<AttachResponse | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classesByImage, setClassesByImage] = useState<Record<string, ClassSummary[]>>({});
  const [classDetailsByKey, setClassDetailsByKey] = useState<Record<string, ClassInfo>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const [tabs, setTabs] = useState<InspectorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);

  const [loadingImages, setLoadingImages] = useState(false);
  const [runtimeStaticFieldsByKey, setRuntimeStaticFieldsByKey] = useState<Record<string, StaticFieldInfo[] | null>>({});
  const [runtimeFieldsByKey, setRuntimeFieldsByKey] = useState<Record<string, FieldInfo[] | null>>({});
  const [runtimeFieldErrorByKey, setRuntimeFieldErrorByKey] = useState<Record<string, string | null>>({});
  const [loadingRuntimeByKey, setLoadingRuntimeByKey] = useState<Record<string, boolean>>({});

  const [error, setError] = useState<string | null>(null);
  const [imageSearch, setImageSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const tabBarRef = useRef<HTMLDivElement>(null);
  const fetchingRuntimeRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<ProcessInfo>('process-selected', async (event) => {
      setError(null);
      setLoadingImages(true);

      try {
        const result = await invoke<AttachResponse>('attach_to_process', {
          pid: event.payload.pid,
          name: event.payload.name,
        });

        setAttached(result);
        setImages([]);
        setClassesByImage({});
        setClassDetailsByKey({});
        setSelectedImageId(null);
        setTabs([]);
        setActiveTabIndex(-1);
        setRuntimeStaticFieldsByKey({});
        setRuntimeFieldsByKey({});
        setRuntimeFieldErrorByKey({});

        const dumpAll = await invoke<DumpAllResponse>('load_all_metadata');
        setImages(dumpAll.images);
        setClassesByImage(dumpAll.classesByImage);
        setClassDetailsByKey(dumpAll.classDetails);
      } catch (invokeError) {
        setImages([]);
        setClassesByImage({});
        setClassDetailsByKey({});
        setSelectedImageId(null);
        setTabs([]);
        setActiveTabIndex(-1);
        setRuntimeStaticFieldsByKey({});
        setRuntimeFieldsByKey({});
        setRuntimeFieldErrorByKey({});
        setAttached(null);
        setError(String(invokeError));
      } finally {
        setLoadingImages(false);
      }
    });

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, []);

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

  const activeTab = activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : null;

  const selectedClass = useMemo<ClassInfo | null>(() => {
    if (!activeTab) return null;
    return classDetailsByKey[`${activeTab.imageId}::${activeTab.classId}`] ?? null;
  }, [classDetailsByKey, activeTab]);

  useEffect(() => {
    if (!selectedImage && selectedImageId !== null) setSelectedImageId(null);
  }, [selectedImage, selectedImageId]);

  useEffect(() => {
    if (selectedImageId && !images.some((image) => image.id === selectedImageId)) setSelectedImageId(null);
  }, [images, selectedImageId]);


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

  // Build a lookup map: full_name -> { imageId, classId, name, namespace, imageName }
  const classLookupMap = useMemo(() => {
    const map = new Map<string, { imageId: string; classId: string; name: string; namespace: string; imageName: string }>();
    for (const img of images) {
      const classes = classesByImage[img.id];
      if (!classes) continue;
      for (const cls of classes) {
        map.set(cls.full_name, {
          imageId: img.id,
          classId: cls.id,
          name: cls.name,
          namespace: cls.namespace,
          imageName: img.name,
        });
      }
    }
    return map;
  }, [images, classesByImage]);

  const openTabForClass = (entry: { imageId: string; classId: string; name: string; namespace: string; imageName: string }) => {
    const existingIndex = tabs.findIndex(t => t.imageId === entry.imageId && t.classId === entry.classId);
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex);
      return;
    }
    const newTab: InspectorTab = entry;
    const newTabs = [...tabs, newTab];
    setTabs(newTabs);
    setActiveTabIndex(newTabs.length - 1);
  };

  const navigateToType = (typeName: string) => {
    const entry = classLookupMap.get(typeName);
    if (entry) openTabForClass(entry);
  };

  const handleClassClick = (item: ClassSummary) => {
    if (!selectedImage) return;
    openTabForClass({
      imageId: selectedImage.id,
      classId: item.id,
      name: item.name,
      namespace: item.namespace,
      imageName: selectedImage.name,
    });
  };

  const handleCloseTab = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = [...tabs];
    newTabs.splice(index, 1);
    setTabs(newTabs);

    if (newTabs.length === 0) {
      setActiveTabIndex(-1);
    } else if (activeTabIndex >= index) {
      setActiveTabIndex(Math.max(0, activeTabIndex - 1));
    }
  };

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

        <div className="w-72 border-r border-[#1c2838] bg-[#0a0f16]/90 flex flex-col shrink-0 relative backdrop-blur-md">
          <div className="p-4 border-b border-[#1c2838]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                <Layers3 size={16} />
              </div>
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Assemblies</h2>
            </div>
            <input
              className="w-full bg-[#05080c] border border-[#1c2838] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
              value={imageSearch}
              onChange={(e) => setImageSearch(e.target.value)}
              placeholder="Filter DLL images..."
              disabled={!images.length}
            />
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
            {!images.length && !loadingImages ? <EmptyPanel icon={<Layers3 size={32} />} title="No image data" msg="Attach to a target." /> : null}
            {loadingImages ? <LoadingInline msg="Loading assemblies..." /> : null}
            {filteredImages.map((image) => (
              <button
                key={image.id}
                onClick={() => {
                  setSelectedImageId(image.id);
                }}
                className={classNames(
                  "w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex flex-col gap-0.5 border",
                  selectedImage?.id === image.id
                    ? "bg-cyan-500/20 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                    : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                )}
              >
                <span className={classNames("text-sm font-medium truncate", selectedImage?.id === image.id ? "text-cyan-100" : "text-slate-300")}>
                  {image.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="w-80 border-r border-[#1c2838] bg-[#070a0f]/90 flex flex-col shrink-0 relative backdrop-blur-md">
          <div className="p-4 border-b border-[#1c2838]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                <Boxes size={16} />
              </div>
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Classes</h2>
            </div>
            <input
              className="w-full bg-[#05080c] border border-[#1c2838] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              placeholder="Filter classes..."
              disabled={!selectedImage}
            />
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
            {!images.length && !loadingImages && !selectedImage && <EmptyPanel icon={<Boxes size={32} />} title="Classes" msg="Select an assembly module first." />}
            {selectedImage && !currentClasses.length ? <EmptyPanel icon={<Boxes size={32} />} title="No classes" msg="No visible classes found." /> : null}
            {filteredClasses.map((item) => {
              const isActiveTab = activeTab?.imageId === selectedImage?.id && activeTab?.classId === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleClassClick(item)}
                  className={classNames(
                    "w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center justify-between border group",
                    isActiveTab
                      ? "bg-cyan-500/20 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                      : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                  )}
                >
                  <div className="flex flex-col overflow-hidden pr-2">
                    <span className={classNames("text-sm font-medium truncate", isActiveTab ? "text-cyan-100" : "text-slate-300 font-mono")}>{item.name}</span>
                    <span className="text-[10px] text-slate-500 truncate">{item.namespace || 'Global Namespace'}</span>
                  </div>
                  <ChevronRight size={14} className={isActiveTab ? "text-cyan-400" : "text-transparent group-hover:text-slate-500"} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0f16]/60 backdrop-blur-xl">

          {tabs.length > 0 && (
            <div
              ref={tabBarRef}
              className="flex items-end gap-1.5 px-6 pt-5 border-b border-[#1c2838] bg-[#070a0f]/80 backdrop-blur-xl shrink-0 overflow-x-auto relative z-30 shadow-[0_10px_30px_rgba(0,0,0,0.3)] min-h-[60px]"
            >
              <AnimatePresence>
                {tabs.map((tab, idx) => {
                  const isActive = activeTabIndex === idx;

                  let Icon = Boxes;
                  const t = tab.namespace?.toLowerCase() || '';
                  if (t.includes('struct') && !t.includes('class')) Icon = List;
                  else if (t.includes('enum') || t === 'userenum') Icon = Type;
                  else if (t.includes('function') || t.includes('delegate')) Icon = Variable;

                  return (
                    <motion.div
                      key={`${tab.imageId}-${tab.classId}`}
                      data-active={isActive}
                      initial={{ opacity: 0, y: 15, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.8, transition: { duration: 0.2 } }}
                      className="relative group flex items-center shrink-0 mb-[-1px]"
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCloseTab(idx, e as any);
                        }
                      }}
                    >
                      {isActive && (
                        <>
                          <motion.div
                            layoutId="activeObjectTabBackground"
                            className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 via-cyan-900/10 to-transparent rounded-t-xl"
                            initial={false}
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                          <motion.div
                            layoutId="activeObjectTabLine"
                            className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)] z-20"
                            initial={false}
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        </>
                      )}

                      <button
                        onClick={() => setActiveTabIndex(idx)}
                        className={`relative flex items-center gap-2.5 px-3 py-2 rounded-t-xl border-x border-t transition-all duration-300 z-10 w-48 overflow-hidden
                                ${isActive
                            ? 'border-cyan-500/30 text-white bg-[#0a0f16]/90 backdrop-blur-md shadow-[0_-5px_20px_rgba(34,211,238,0.1)]'
                            : 'border-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/5 hover:border-white/10'
                          }`}
                      >
                        <div className={`p-1.5 rounded-lg transition-colors border ${isActive ? 'bg-cyan-950/80 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'bg-slate-900 text-slate-600 border-slate-800'} shrink-0`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex flex-col items-start flex-1 min-w-0 pr-5">
                          <span className="text-[12px] font-bold tracking-widest truncate w-full text-left font-mono">{tab.name}</span>
                        </div>
                      </button>

                      <button
                        onClick={(e) => handleCloseTab(idx, e)}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 z-20 overflow-hidden
                                bg-transparent text-transparent
                                group-hover:bg-rose-500/20 group-hover:text-rose-400 hover:!bg-rose-500 hover:!text-white hover:shadow-[0_0_15px_rgba(244,63,94,0.6)]
                                ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                                ${!isActive && 'pointer-events-none group-hover:pointer-events-auto'}
                            `}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {error ? (
            <div className="m-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono flex items-center gap-2 z-10">
              <Binary size={16} /> {error}
            </div>
          ) : null}

          {!activeTab && tabs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center z-10">
              <EmptyPanel icon={<ScanSearch size={48} />} title="Class Inspector" msg="Select a class to analyze layout, state, and inheritance." large />
            </div>
          ) : null}

          {selectedClass && activeTab ? (
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6 z-10">

              <div className="flex flex-col gap-1 pb-4 border-b border-[#1c2838]">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
                  {selectedClass.name}
                </h1>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1"><Hexagon size={12} className="text-cyan-500" /> {selectedClass.namespace || 'Global'}</span>
                  <span className="flex items-center gap-1"><Layers3 size={12} className="text-blue-500" /> {activeTab.imageName}</span>
                </div>
              </div>

              <Card title="Inheritance hierarchy">
                <div className="flex flex-wrap gap-2 items-center">
                  {selectedClass.inheritance.length ? selectedClass.inheritance.map((node, index) => (
                    <div key={`${node.name}-${index}`} className="flex items-center gap-2">
                      <TypeLink typeName={node.name} lookupMap={classLookupMap} onNavigate={navigateToType} className="px-2 py-1 bg-[#131b26] border border-[#1c2838] rounded-md text-xs font-mono" />
                      {index < selectedClass.inheritance.length - 1 && <ChevronRight size={14} className="text-slate-600" />}
                    </div>
                  )) : <span className="text-xs text-slate-500">No inheritance metadata available.</span>}
                </div>
              </Card>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                <Card title="Instance Layout" action={isLoadingRuntimeFields && <LoaderCircle className="animate-spin text-cyan-400" size={14} />}>
                  <Table
                    headers={['Offset', 'Type', 'Name']}
                    data={displayFields.map((f, index) => [
                      <span key={`offset-${index}`} className="text-cyan-400">0x{f.offset?.toUpperCase() ?? '?'}</span>,
                      <TypeLink key={`type-${index}`} typeName={f.field_type} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
                      <span key={`name-${index}`} className="text-slate-200">{f.name}</span>
                    ])}
                  />
                </Card>

                <Card
                  title="Static State"
                  action={activeRuntimeFieldError && <span className="text-[10px] text-red-400">{activeRuntimeFieldError}</span>}
                >
                  <Table
                    headers={['Type', 'Name', 'Address', 'Value']}
                    data={displayStaticFields.map((f, index) => [
                      <TypeLink key={`stype-${index}`} typeName={f.field_type} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
                      <span key={`sname-${index}`} className="text-slate-200">{f.name}</span>,
                      <span key={`saddr-${index}`} className="text-cyan-400 font-mono text-[10px] break-all">{f.address ?? '?'}</span>,
                      <span key={`sval-${index}`} className="text-yellow-400 font-mono text-[10px] break-all">{f.value ?? '?'}</span>
                    ])}
                  />
                </Card>

                <div className="xl:col-span-2">
                  <Card title="Callable Methods">
                    <Table
                      headers={['Method', 'Signature']}
                      data={selectedClass.methods.map((m, index) => [
                        <span key={`mname-${index}`} className="text-blue-300 font-semibold">{m.name}</span>,
                        <span key={`msig-${index}`} className="text-slate-400 text-[10px] break-all whitespace-pre-wrap leading-tight">
                          {renderSignatureWithLinks(m.signature, classLookupMap, navigateToType)}
                        </span>
                      ])}
                    />
                  </Card>
                </div>

              </div>

            </div>
          ) : null}

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

// Helper Components
function EmptyPanel({ icon, title, msg, large = false }: { icon: React.ReactNode, title: string, msg: string, large?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center h-full text-slate-500 gap-3 ${large ? 'scale-110' : ''} p-4 text-center`}>
      <div className="opacity-40">{icon}</div>
      <div className="flex flex-col">
        <span className={`font-semibold ${large ? 'text-lg text-slate-300' : 'text-sm text-slate-400'}`}>{title}</span>
        <span className="text-xs">{msg}</span>
      </div>
    </div>
  )
}

function LoadingInline({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-4 text-cyan-500 text-sm font-medium">
      <LoaderCircle size={16} className="animate-spin" />
      {msg}
    </div>
  )
}

function Card({ title, children, action }: { title: string, children: React.ReactNode, action?: React.ReactNode }) {
  return (
    <div className="bg-[#05080c]/80 border border-[#1c2838] rounded-xl overflow-hidden flex flex-col shadow-lg backdrop-blur-sm">
      <div className="px-4 py-2 border-b border-[#1c2838] bg-[#0a0f16] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

function Table({ headers, data }: { headers: string[], data: React.ReactNode[][] }) {
  if (data.length === 0) return <span className="text-xs text-slate-500">No data available.</span>

  return (
    <div className="w-full overflow-x-auto hide-scrollbar rounded-lg border border-[#1c2838]">
      <table className="w-full text-left text-xs bg-[#0a0f16]/50">
        <thead className="bg-[#0e1620] sticky top-0 border-b border-[#1c2838] text-slate-500">
          <tr>
            {headers.map(h => <th key={h} className="px-3 py-2 font-medium tracking-wide uppercase">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1c2838]">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              {row.map((col, j) => <td key={j} className="px-3 py-2 font-mono align-top">{col}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type LookupMap = Map<string, { imageId: string; classId: string; name: string; namespace: string; imageName: string }>;

function TypeLink({ typeName, lookupMap, onNavigate, className = '' }: {
  typeName: string;
  lookupMap: LookupMap;
  onNavigate: (typeName: string) => void;
  className?: string;
}) {
  const isNavigable = lookupMap.has(typeName);

  if (isNavigable) {
    return (
      <span
        className={`${className} hover:brightness-125 cursor-pointer transition-colors`}
        onClick={() => onNavigate(typeName)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onNavigate(typeName); }}
      >
        {typeName}
      </span>
    );
  }

  return <span className={`${className}`}>{typeName}</span>;
}

function renderSignatureWithLinks(
  signature: string,
  lookupMap: LookupMap,
  onNavigate: (typeName: string) => void
): React.ReactNode[] {
  // Tokenize: split on whitespace, parens, commas, angle brackets while keeping delimiters
  const tokens = signature.split(/(\s+|[(),<>])/);

  return tokens.map((token, i) => {
    const trimmed = token.trim();
    if (!trimmed || /^[\s(),<>]+$/.test(token)) {
      return <span key={i}>{token}</span>;
    }

    if (lookupMap.has(trimmed)) {
      return (
        <span
          key={i}
          className="text-yellow-400 hover:brightness-125 cursor-pointer transition-colors"
          onClick={() => onNavigate(trimmed)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onNavigate(trimmed); }}
        >
          {trimmed}
        </span>
      );
    }

    return <span key={i}>{token}</span>;
  });
}
