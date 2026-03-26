import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Box, Layers3, Search, X } from 'lucide-react';
import { createEmptyClassInfoSelection, filterStudioClassCatalog } from '@/domain/studio/editor';
import { useStudioAddNodeModalState } from '@/features/studio/application/useStudioAddNodeModalState';

type ModalMode = 'nodes' | 'class-picker';

export function AddNodeModal() {
  const { catalog, addNode, isAddModalOpen, closeAddModal, addModalPosition, transform, classes, classCatalog } = useStudioAddNodeModalState();
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<ModalMode>('nodes');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddModalOpen) {
      setSearchQuery('');
      setMode('nodes');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isAddModalOpen]);

  const availableNodes = useMemo(() => catalog.getAll(), [catalog]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return availableNodes;
    const query = searchQuery.toLowerCase();
    return availableNodes.filter(
      (node) =>
        node.manifest.displayName.toLowerCase().includes(query) ||
        node.manifest.description.toLowerCase().includes(query) ||
        node.manifest.type.toLowerCase().includes(query)
    );
  }, [searchQuery, availableNodes]);

  const nodesByCategory = useMemo(() => {
    const groups = new Map<string, typeof availableNodes>();
    filteredNodes.forEach((node) => {
      const cat = node.manifest.category || 'General';
      const items = groups.get(cat) ?? [];
      items.push(node);
      groups.set(cat, items);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredNodes]);

  const trimmedSearchQuery = searchQuery.trim();
  const hasClassSearchQuery = trimmedSearchQuery.length > 0;

  const filteredClasses = useMemo(() => {
    if (!hasClassSearchQuery) {
      return [];
    }

    return filterStudioClassCatalog(classes, trimmedSearchQuery).slice(0, 60);
  }, [classes, hasClassSearchQuery, trimmedSearchQuery]);

  const handleCreateGenericNode = (typeId: string) => {
    if (!addModalPosition) {
      return;
    }

    addNode(typeId, addModalPosition);
    closeAddModal();
  };

  const handleCreateClassNode = (binding: (typeof filteredClasses)[number]) => {
    if (!addModalPosition) {
      return;
    }

    const request = classCatalog.createNodeRequest(binding, addModalPosition);
    if (!request) {
      return;
    }

    addNode('class-ref', addModalPosition, {
      binding: request.binding,
      infoSelection: createEmptyClassInfoSelection(),
    });
    closeAddModal();
  };

  if (!isAddModalOpen || !addModalPosition) return null;

  const screenX = addModalPosition.x * transform.scale + transform.x;
  const screenY = addModalPosition.y * transform.scale + transform.y;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" 
        onClick={closeAddModal}
        onContextMenu={(e) => { e.preventDefault(); closeAddModal(); }}
      />
      
      <div 
        className="studio-modal-pop fixed z-50 w-96 bg-gradient-to-b from-[#0f172a]/95 to-[#0a0f16]/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col ring-1 ring-white/5"
        style={{
            left: Math.min(screenX, window.innerWidth - 384),
            top: Math.min(screenY, window.innerHeight - 500),
            maxHeight: '500px'
        }}
      >
        <div className="p-4 border-b border-slate-700/50 flex items-center gap-3 bg-slate-900/60 relative z-10 shadow-sm">
          <Search size={18} className="text-cyan-400 opacity-80" />
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === 'nodes' ? 'Search for nodes...' : 'Search classes...'}
            className="flex-1 bg-transparent border-none outline-none text-slate-100 text-[15px] font-medium placeholder:text-slate-500 tracking-wide"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeAddModal();
              if (e.key === 'Enter' && mode === 'nodes' && filteredNodes.length > 0) {
                if (filteredNodes[0].manifest.type === 'class-ref') {
                  setMode('class-picker');
                  setSearchQuery('');
                  return;
                }

                handleCreateGenericNode(filteredNodes[0].manifest.type);
              }
              if (e.key === 'Enter' && mode === 'class-picker' && filteredClasses.length > 0) {
                handleCreateClassNode(filteredClasses[0]);
              }
            }}
          />
          {mode === 'class-picker' ? (
            <button 
              onClick={() => { setMode('nodes'); setSearchQuery(''); }} 
              className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              title="Back to Nodes"
            >
              <ArrowLeft size={14} />
            </button>
          ) : null}
          <button 
            onClick={closeAddModal} 
            className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800/50 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="studio-scrollbar flex-1 overflow-y-auto relative [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/60 hover:[&::-webkit-scrollbar-thumb]:bg-cyan-500/40 [&::-webkit-scrollbar-thumb]:rounded-full">
          {mode === 'nodes' && filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Search size={32} className="mb-3 opacity-20" />
              <div className="text-sm font-medium text-slate-400">No nodes found</div>
              <div className="text-xs opacity-60 mt-1">"{searchQuery}" returned no results.</div>
            </div>
          ) : null}

          {mode === 'nodes' && filteredNodes.length > 0 ? (
            <div className="flex flex-col gap-6 p-4">
              {nodesByCategory.map(([category, nodes]) => (
                <div key={category} className="flex flex-col">
                  {/* Category Header */}
                  <div className="px-2 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-slate-700/80 shadow-sm" />
                     {category}
                  </div>
                  {/* Category List */}
                  <div className="flex flex-col gap-1.5">
                    {nodes.map((node) => {
                      const Icon = node.icon;
                      return (
                        <button
                          key={node.manifest.type}
                          className="group flex justify-between items-center p-2.5 rounded-xl hover:bg-slate-800/60 transition-all duration-300 border border-transparent hover:border-slate-700/60 hover:shadow-md text-left w-full"
                          onClick={() => {
                            if (node.manifest.type === 'class-ref') {
                              setMode('class-picker');
                              setSearchQuery('');
                              return;
                            }
                            handleCreateGenericNode(node.manifest.type);
                          }}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                             <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-300">
                                <Icon size={20} className="text-cyan-400 group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-all" />
                             </div>
                             <div className="flex flex-col min-w-0">
                               <span className="text-slate-200 text-[14px] font-bold group-hover:text-cyan-300 transition-colors drop-shadow-sm">{node.manifest.displayName}</span>
                               <span className="text-slate-500 text-[11px] font-medium truncate w-full mt-0.5" title={node.manifest.description}>{node.manifest.description}</span>
                             </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {mode === 'class-picker' && !hasClassSearchQuery ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Box size={32} className="mb-4 opacity-20" />
              <div className="text-sm font-medium text-slate-300">Search for a Class</div>
              <div className="text-xs text-slate-500 mt-1 max-w-[200px] text-center leading-relaxed">Type a name or namespace to search the metadata catalog.</div>
            </div>
          ) : null}

          {mode === 'class-picker' && hasClassSearchQuery && filteredClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Search size={32} className="mb-3 opacity-20" />
              <div className="text-sm font-medium text-slate-400">No classes found</div>
              <div className="text-xs opacity-60 mt-1 text-center max-w-[200px]">"{trimmedSearchQuery}" does not match any loaded metadata.</div>
            </div>
          ) : null}

          {mode === 'class-picker' && hasClassSearchQuery ? (
            <div className="flex flex-col gap-2 p-3">
              {filteredClasses.map((entry) => (
                <button
                  key={`${entry.imageStableId}::${entry.classStableId}`}
                  className="group w-full text-left p-3.5 rounded-xl border border-transparent transition-all duration-300 flex flex-col gap-1.5 hover:border-cyan-500/40 hover:bg-cyan-900/10 hover:shadow-lg"
                  onClick={() => handleCreateClassNode(entry)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold truncate transition-colors text-slate-200 group-hover:text-cyan-400 drop-shadow-sm">
                      {entry.fullName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap font-medium">
                    <span className="bg-slate-950/40 px-1.5 py-0.5 rounded-md border border-slate-800/60">{entry.namespace || 'Global'}</span>
                    <span className="text-slate-700/50">•</span>
                    <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-500 transition-colors">
                      <Layers3 size={10} />
                      {entry.imageName}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
