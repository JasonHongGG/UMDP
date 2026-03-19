import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Search } from 'lucide-react';
import type { INodeEditProps } from '../../core/studio/types';
import { filterStudioClassCatalog, reconcileClassInfoSelection } from '../../domain/studio/editor';
import { useStudioRuntimeData } from '../../core/studio/runtimeData';
import type { ClassNodeData } from './classNodeModel';

export const ClassNodeBindingEditor: React.FC<INodeEditProps<ClassNodeData>> = ({ data, updateData }) => {
  const runtimeData = useStudioRuntimeData();
  const [bindingSearchQuery, setBindingSearchQuery] = useState('');
  const [isBindingPickerOpen, setIsBindingPickerOpen] = useState(!data.binding);

  useEffect(() => {
    if (!data.binding) {
      setIsBindingPickerOpen(true);
    }
  }, [data.binding]);

  const filteredBindings = useMemo(() => {
    return filterStudioClassCatalog(runtimeData.classes, bindingSearchQuery).slice(0, 60);
  }, [bindingSearchQuery, runtimeData.classes]);

  const handleBindClass = (classBinding: (typeof filteredBindings)[number]) => {
    const request = runtimeData.createNodeRequestFromBinding(classBinding);
    if (!request) {
      return;
    }

    updateData({
      binding: request.binding,
      availableInfo: request.availableInfo,
      infoSelection: reconcileClassInfoSelection(data.infoSelection, request.availableInfo),
    });
    setIsBindingPickerOpen(false);
  };

  return (
    <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Class Binding</div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide px-1">Bound Class</label>

          <div className="relative group">
            {data.binding ? (
              <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-slate-900/50 p-4 shadow-[0_4px_20px_rgba(6,182,212,0.1)] transition-all duration-300 hover:shadow-[0_4px_25px_rgba(6,182,212,0.15)] hover:border-cyan-400/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-cyan-100 font-bold truncate tracking-tight">{data.binding.fullName}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap font-medium">
                      <span className="bg-slate-900/80 px-2 py-0.5 rounded text-slate-300 border border-slate-700/50">{data.binding.namespace || 'Global'}</span>
                      <span className="inline-flex items-center gap-1.5 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50 text-cyan-400/80"><Layers3 size={12} /> {data.binding.imageName}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBindingPickerOpen((prev) => !prev)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all text-xs font-semibold text-slate-300 ml-4 backdrop-blur-sm"
                  >
                    {isBindingPickerOpen ? 'Hide Picker' : 'Rebind'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/50 p-5 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-amber-200/90 leading-relaxed">
                    This node is not bound yet. <br /> <span className="text-amber-400/70 text-xs">Pick a concrete class below to configure the info payload.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBindingPickerOpen((prev) => !prev)}
                    className="shrink-0 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 transition-all text-xs font-semibold shadow-sm"
                  >
                    {isBindingPickerOpen ? 'Close' : 'Select Class'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {isBindingPickerOpen ? (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-2xl relative">
            <div className="px-4 py-3 border-b border-slate-700/70 bg-slate-800/80 flex items-center gap-3 relative">
              <Search size={16} className="text-cyan-400 absolute left-4" />
              <input
                type="text"
                value={bindingSearchQuery}
                onChange={(event) => setBindingSearchQuery(event.target.value)}
                placeholder="Search classes by name, namespace, or assembly..."
                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:bg-slate-950 transition-all"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              {filteredBindings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700/50 px-3 py-8 text-sm text-slate-500 text-center">
                  No classes found matching "<span className="text-slate-300">{bindingSearchQuery}</span>".
                </div>
              ) : (
                filteredBindings.map((entry) => (
                  <button
                    key={`${entry.imageStableId}::${entry.classStableId}`}
                    type="button"
                    className={`group w-full text-left p-3 rounded-lg border transition-all duration-200 hover:-translate-y-0.5
                      ${data.binding?.imageStableId === entry.imageStableId && data.binding?.classStableId === entry.classStableId
                        ? 'border-cyan-500/50 bg-cyan-500/15 shadow-[0_2px_10px_rgba(6,182,212,0.15)]'
                        : 'border-transparent hover:border-slate-600/50 hover:bg-slate-800/80 hover:shadow-md'}`}
                    onClick={() => handleBindClass(entry)}
                  >
                    <div className={`text-sm font-semibold truncate transition-colors ${data.binding?.classStableId === entry.classStableId ? 'text-cyan-100' : 'text-slate-200 group-hover:text-white'}`}>{entry.fullName}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                      <span className="bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800">{entry.namespace || 'Global'}</span>
                      <span className="text-slate-700">•</span>
                      <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-400/70 transition-colors"><Layers3 size={10} /> {entry.imageName}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};