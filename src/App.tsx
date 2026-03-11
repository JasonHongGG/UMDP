import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  Binary, Database, Layers3, Boxes, Target, ChevronRight, ScanSearch, Network, LoaderCircle, Hexagon
} from 'lucide-react';
import type { AttachResponse, ClassInfo, ClassSummary, FieldInfo, ImageInfo, ProcessInfo, RuntimeClassOverlayResponse, StaticFieldInfo } from './types';
import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import './styles.css';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function App() {
  const [attached, setAttached] = useState<AttachResponse | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classesByImage, setClassesByImage] = useState<Record<string, ClassSummary[]>>({});
  const [classDetailsByKey, setClassDetailsByKey] = useState<Record<string, ClassInfo>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingClassDetails, setLoadingClassDetails] = useState(false);
  const [loadingRuntimeFields, setLoadingRuntimeFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeFieldError, setRuntimeFieldError] = useState<string | null>(null);
  const [runtimeStaticFields, setRuntimeStaticFields] = useState<StaticFieldInfo[] | null>(null);
  const [runtimeFields, setRuntimeFields] = useState<FieldInfo[] | null>(null);
  const [imageSearch, setImageSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

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
        setSelectedClassId(null);
        setRuntimeStaticFields(null);
        setRuntimeFields(null);
        setRuntimeFieldError(null);

        const imageCatalog = await invoke<ImageInfo[]>('get_image_catalog');
        setImages(imageCatalog);
      } catch (invokeError) {
        setImages([]);
        setClassesByImage({});
        setClassDetailsByKey({});
        setSelectedImageId(null);
        setSelectedClassId(null);
        setAttached(null);
        setRuntimeStaticFields(null);
        setRuntimeFields(null);
        setRuntimeFieldError(null);
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

  const selectedClassSummary = useMemo<ClassSummary | null>(() => {
    return filteredClasses.find((item) => item.id === selectedClassId)
      ?? currentClasses.find((item) => item.id === selectedClassId)
      ?? null;
  }, [currentClasses, filteredClasses, selectedClassId]);

  const selectedClass = useMemo<ClassInfo | null>(() => {
    if (!selectedImageId || !selectedClassId) return null;
    return classDetailsByKey[`${selectedImageId}::${selectedClassId}`] ?? null;
  }, [classDetailsByKey, selectedClassId, selectedImageId]);

  useEffect(() => {
    if (!selectedImage && selectedImageId !== null) setSelectedImageId(null);
  }, [selectedImage, selectedImageId]);

  useEffect(() => {
    if (selectedImageId && !images.some((image) => image.id === selectedImageId)) setSelectedImageId(null);
  }, [images, selectedImageId]);

  useEffect(() => {
    if (selectedClassId && !currentClasses.some((item) => item.id === selectedClassId)) setSelectedClassId(null);
  }, [currentClasses, selectedClassId]);

  useEffect(() => {
    if (!selectedImageId || classesByImage[selectedImageId]) return;

    let cancelled = false;
    setLoadingClasses(true);
    setError(null);

    invoke<ClassSummary[]>('get_image_classes', { imageId: selectedImageId })
      .then((classes) => {
        if (!cancelled) {
          setClassesByImage((current) => ({ ...current, [selectedImageId]: classes }));
        }
      })
      .catch((invokeError) => {
        if (!cancelled) setError(String(invokeError));
      })
      .finally(() => {
        if (!cancelled) setLoadingClasses(false);
      });

    return () => { cancelled = true; };
  }, [classesByImage, selectedImageId]);

  useEffect(() => {
    if (!selectedImageId || !selectedClassId) return;

    const cacheKey = `${selectedImageId}::${selectedClassId}`;
    if (classDetailsByKey[cacheKey]) return;

    let cancelled = false;
    setLoadingClassDetails(true);
    setError(null);

    invoke<ClassInfo>('get_class_details', { imageId: selectedImageId, classId: selectedClassId })
      .then((classInfo) => {
        if (!cancelled) {
          setClassDetailsByKey((current) => ({ ...current, [cacheKey]: classInfo }));
        }
      })
      .catch((invokeError) => {
        if (!cancelled) setError(String(invokeError));
      })
      .finally(() => {
        if (!cancelled) setLoadingClassDetails(false);
      });

    return () => { cancelled = true; };
  }, [classDetailsByKey, selectedClassId, selectedImageId]);

  useEffect(() => {
    if (!attached || !selectedImage || !selectedClass) {
      setRuntimeStaticFields(null);
      setRuntimeFields(null);
      setRuntimeFieldError(null);
      setLoadingRuntimeFields(false);
      return;
    }

    if (attached.runtime !== 'Mono') {
      setRuntimeStaticFields(null);
      setRuntimeFields(null);
      setRuntimeFieldError('Runtime static field resolution is currently available for Mono targets only.');
      setLoadingRuntimeFields(false);
      return;
    }

    let cancelled = false;
    setLoadingRuntimeFields(true);
    setRuntimeFieldError(null);

    invoke<RuntimeClassOverlayResponse>('get_runtime_static_fields', {
      imageId: selectedImage.id,
      classNamespace: selectedClass.namespace,
      className: selectedClass.name,
    })
      .then((response) => {
        if (!cancelled) {
          setRuntimeStaticFields(response.static_fields);
          setRuntimeFields(response.fields);
        }
      })
      .catch((invokeError) => {
        if (!cancelled) {
          setRuntimeStaticFields(null);
          setRuntimeFields(null);
          setRuntimeFieldError(String(invokeError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRuntimeFields(false);
      });

    return () => { cancelled = true; };
  }, [attached, selectedClass, selectedImage]);

  const displayStaticFields = runtimeStaticFields ?? selectedClass?.static_fields ?? [];
  const displayFields = runtimeFields ?? selectedClass?.fields ?? [];

  return (
    <MainLayout>
      <TopBar
        attachedProcess={attached ? `${attached.process_name} (${attached.process_id})` : null}
        onOpenSelector={openSelector}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">

        {/* --- Sidebar 1: Images (Assemblies) --- */}
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
                  setSelectedClassId(null);
                  setRuntimeStaticFields(null);
                  setRuntimeFields(null);
                  setRuntimeFieldError(null);
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

        {/* --- Sidebar 2: Classes --- */}
        <div className="w-80 border-r border-[#1c2838] bg-[#070a0f]/90 flex flex-col shrink-0 relative backdrop-blur-md">
          <div className="p-4 border-b border-[#1c2838]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
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
            {!selectedImage && !loadingClasses ? <EmptyPanel icon={<Boxes size={32} />} title="Select an image" msg="Choose an assembly to view its classes." /> : null}
            {selectedImage && loadingClasses ? <LoadingInline msg="Loading classes..." /> : null}
            {selectedImage && !loadingClasses && !currentClasses.length ? <EmptyPanel icon={<Boxes size={32} />} title="No classes" msg="No visible classes found." /> : null}
            {filteredClasses.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedClassId(item.id);
                  setRuntimeStaticFields(null);
                  setRuntimeFields(null);
                  setRuntimeFieldError(null);
                }}
                className={classNames(
                  "w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center justify-between border group",
                  selectedClassSummary?.id === item.id
                    ? "bg-blue-600/20 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                    : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                )}
              >
                <div className="flex flex-col overflow-hidden pr-2">
                  <span className={classNames("text-sm font-medium truncate", selectedClassSummary?.id === item.id ? "text-blue-100" : "text-slate-300 font-mono")}>{item.name}</span>
                  <span className="text-[10px] text-slate-500 truncate">{item.namespace || 'Global Namespace'}</span>
                </div>
                <ChevronRight size={14} className={selectedClassSummary?.id === item.id ? "text-blue-400" : "text-transparent group-hover:text-slate-500"} />
              </button>
            ))}
          </div>
        </div>

        {/* --- Main Content: Class Details --- */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0f16]/60 backdrop-blur-xl">
          {error ? (
            <div className="m-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono flex items-center gap-2">
              <Binary size={16} /> {error}
            </div>
          ) : null}

          {!selectedClassSummary && !loadingClassDetails ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyPanel icon={<ScanSearch size={48} />} title="Class Inspector" msg="Select a class to analyze layout, state, and inheritance." large />
            </div>
          ) : null}

          {selectedClassSummary && loadingClassDetails ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingInline msg="Inspecting class metadata..." />
            </div>
          ) : null}

          {selectedClass ? (
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6">

              {/* Header Information */}
              <div className="flex flex-col gap-1 pb-4 border-b border-[#1c2838]">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
                  {selectedClass.name}
                </h1>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1"><Hexagon size={12} className="text-cyan-500" /> {selectedClass.namespace || 'Global'}</span>
                  <span className="flex items-center gap-1"><Layers3 size={12} className="text-blue-500" /> {selectedImage?.name}</span>
                </div>
              </div>

              {/* Inheritance Chain */}
              <Card title="Inheritance hierarchy">
                <div className="flex flex-wrap gap-2 items-center">
                  {selectedClass.inheritance.length ? selectedClass.inheritance.map((node, index) => (
                    <div key={`${node.name}-${index}`} className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-[#131b26] border border-[#1c2838] rounded-md text-xs font-mono text-slate-300">
                        {node.name}
                      </span>
                      {index < selectedClass.inheritance.length - 1 && <ChevronRight size={14} className="text-slate-600" />}
                    </div>
                  )) : <span className="text-xs text-slate-500">No inheritance metadata available.</span>}
                </div>
              </Card>

              {/* Grid Layout for Tables */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Instance Fields */}
                <Card title="Instance Layout" action={loadingRuntimeFields && <LoaderCircle className="animate-spin text-cyan-400" size={14} />}>
                  <Table
                    headers={['Offset', 'Type', 'Name']}
                    data={displayFields.map(f => [
                      <span className="text-cyan-400">0x{f.offset?.toUpperCase() ?? '?'}</span>,
                      <span className="text-yellow-400">{f.field_type}</span>,
                      <span className="text-slate-200">{f.name}</span>
                    ])}
                  />
                </Card>

                {/* Static Fields */}
                <Card
                  title="Static State"
                  action={runtimeFieldError && <span className="text-[10px] text-red-400">{runtimeFieldError}</span>}
                >
                  <Table
                    headers={['Type', 'Name', 'Address', 'Value']}
                    data={displayStaticFields.map(f => [
                      <span className="text-yellow-400">{f.field_type}</span>,
                      <span className="text-slate-200">{f.name}</span>,
                      <span className="text-cyan-400 font-mono text-[10px] break-all">{f.address ?? '?'}</span>,
                      <span className="text-yellow-400 font-mono text-[10px] break-all">{f.value ?? '?'}</span>
                    ])}
                  />
                </Card>

                {/* Methods */}
                <div className="xl:col-span-2">
                  <Card title="Callable Methods">
                    <Table
                      headers={['Method', 'Signature']}
                      data={selectedClass.methods.map(m => [
                        <span className="text-blue-300 font-semibold">{m.name}</span>,
                        <span className="text-slate-400 text-[10px] break-all whitespace-pre-wrap leading-tight">{m.signature}</span>
                      ])}
                    />
                  </Card>
                </div>

              </div>

            </div>
          ) : null}

        </div>

      </div>

      {/* Footer Status Bar */}
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
