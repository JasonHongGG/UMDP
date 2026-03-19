import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Box, Layers3, Search, X } from 'lucide-react';
import { createEmptyClassInfoSelection, filterStudioClassCatalog } from '../../../domain/studio/editor';
import { useStudioGraph, useStudioUi } from '../../../core/studio/StudioContext';
import { globalNodeRegistry } from '../../../core/studio/NodeRegistry';
import { useStudioRuntimeData } from '../../../core/studio/runtimeData';

type ModalMode = 'nodes' | 'class-picker';

export function AddNodeModal() {
  const { addNode } = useStudioGraph();
  const { isAddModalOpen, closeAddModal, addModalPosition, transform } = useStudioUi();
  const { classes, createNodeRequestFromBinding } = useStudioRuntimeData();
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

  const availableNodes = useMemo(() => globalNodeRegistry.getAll(), []);

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

    const request = createNodeRequestFromBinding(binding, addModalPosition);
    if (!request) {
      return;
    }

    addNode('class-ref', addModalPosition, {
      binding: request.binding,
      availableInfo: request.availableInfo,
      infoSelection: createEmptyClassInfoSelection(),
    });
    closeAddModal();
  };

  if (!isAddModalOpen || !addModalPosition) return null;

  // We convert the logical canvas coordinates back to screen coordinates 
  // just for displaying the modal at the right physical place on the screen.
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
        className="studio-modal-pop fixed z-50 w-80 bg-[#0f172a]/95 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
        style={{
            left: Math.min(screenX, window.innerWidth - 320),
            top: Math.min(screenY, window.innerHeight - 400),
            maxHeight: '400px'
        }}
      >
        <div className="p-3 border-b border-slate-700/50 flex items-center gap-2 bg-slate-900/50">
          <Search size={16} className="text-cyan-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === 'nodes' ? 'Search nodes...' : 'Search classes...'}
            className="flex-1 bg-transparent border-none outline-none text-slate-200 text-sm placeholder:text-slate-500"
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
            <button onClick={() => { setMode('nodes'); setSearchQuery(''); }} className="text-slate-500 hover:text-slate-300 transition-colors">
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <button onClick={closeAddModal} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="studio-scrollbar flex-1 overflow-y-auto p-2">
          {mode === 'nodes' && filteredNodes.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No nodes found matching "{searchQuery}"
            </div>
          ) : null}

          {mode === 'nodes' ? (
            <div className="flex flex-col gap-1">
              {filteredNodes.map((node) => {
                const Icon = node.icon;
                return (
                  <button
                    key={node.manifest.type}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/80 transition-all text-left group border border-transparent hover:border-slate-700/50"
                    onClick={() => {
                      if (node.manifest.type === 'class-ref') {
                        setMode('class-picker');
                        setSearchQuery('');
                        return;
                      }

                      handleCreateGenericNode(node.manifest.type);
                    }}
                  >
                    <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                      <Icon size={16} className="text-cyan-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-200 text-sm font-medium group-hover:text-cyan-400 transition-colors">
                        {node.manifest.displayName}
                      </span>
                      {node.manifest.category ? (
                        <span className="text-[10px] uppercase tracking-wider text-cyan-500/80 mt-0.5">{node.manifest.category}</span>
                      ) : null}
                      <span className="text-slate-500 text-xs mt-0.5 line-clamp-2">
                        {node.manifest.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {mode === 'class-picker' && !hasClassSearchQuery ? (
            <div className="p-6 text-center text-slate-500 text-sm space-y-2">
              <div>Type a class name to start searching.</div>
              <div className="text-xs text-slate-600">Results are shown only after you enter a search query, to avoid rendering the full metadata catalog.</div>
            </div>
          ) : null}

          {mode === 'class-picker' && hasClassSearchQuery && filteredClasses.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm space-y-2">
              <div>No classes found matching "{trimmedSearchQuery}"</div>
              <div className="text-xs text-slate-600">Metadata must be loaded before a Class Reference node can be created.</div>
            </div>
          ) : null}

          {mode === 'class-picker' && hasClassSearchQuery ? (
            <div className="flex flex-col gap-1">
              {filteredClasses.map((entry) => (
                <button
                  key={`${entry.imageStableId}::${entry.classStableId}`}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/80 transition-all text-left group border border-transparent hover:border-emerald-500/30"
                  onClick={() => handleCreateClassNode(entry)}
                >
                  <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <Box size={16} className="text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-100 text-sm font-medium group-hover:text-emerald-300 transition-colors block truncate">
                      {entry.fullName}
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-[10px] uppercase tracking-wider text-slate-500 min-w-0">
                      <span className="truncate">{entry.namespace || 'Global'}</span>
                      <span className="text-slate-700">•</span>
                      <span className="inline-flex items-center gap-1 truncate text-cyan-500/80">
                        <Layers3 size={10} />
                        {entry.imageName}
                      </span>
                    </div>
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
