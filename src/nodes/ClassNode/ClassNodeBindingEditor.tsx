import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Search, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import type { INodeEditProps } from '../../core/studio/types';
import { filterStudioClassCatalog, reconcileClassInfoSelection } from '../../domain/studio/editor';
import { useStudioRuntimeData } from '../../core/studio/runtimeData';
import { useExpressionDrag } from '../../core/studio/drag/ExpressionDragContext';
import {
  createLiteralExpressionSource,
  getExpressionSourceDisplayValue,
  readExpressionDragData,
} from '../../core/studio/expression';
import type { ExpressionSource } from '../../domain/studio/contracts';
import type { ClassNodeData } from './classNodeModel';

const InstanceAddressInput: React.FC<{
  value: ExpressionSource | null | undefined;
  onChange: (value: ExpressionSource) => void;
}> = ({ value, onChange }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useExpressionDrag();

  return (
    <div
      className={`relative rounded-xl border transition-all duration-300 overflow-hidden ${
        isDragOver || isCustomDragOver
          ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/50'
          : 'border-slate-700/60 bg-slate-950/50 hover:border-slate-600/80 hover:bg-slate-950/80'
      }`}
      onMouseEnter={() => {
        if (activeExpressionDrag) setIsCustomDragOver(true);
      }}
      onMouseLeave={() => {
        setIsCustomDragOver(false);
      }}
      onMouseUpCapture={(event) => {
        if (!activeExpressionDrag) return;
        event.preventDefault();
        event.stopPropagation();
        setIsCustomDragOver(false);
        onChange(activeExpressionDrag.source);
        endExpressionDrag();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        setIsCustomDragOver(false);
        const expressionSource = readExpressionDragData(event.dataTransfer);
        if (expressionSource) {
          onChange(expressionSource);
        }
      }}
    >
      <div className="flex items-center">
        <div className="flex items-center justify-center pl-3 pr-1">
           {value?.kind === 'input-expression' ? (
             <span className="text-[9px] font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/30 tracking-wider shadow-sm">INPUT</span>
           ) : value?.kind === 'static-expression' ? (
             <span className="text-[9px] font-bold text-fuchsia-300 bg-fuchsia-500/20 px-1.5 py-0.5 rounded border border-fuchsia-500/30 tracking-wider shadow-sm">STATIC</span>
           ) : (
             <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 tracking-wider shadow-sm">LITERAL</span>
           )}
        </div>
        <input
          type="text"
          value={getExpressionSourceDisplayValue(value)}
          placeholder="Type literal address or drop expression..."
          onChange={(event) => onChange(createLiteralExpressionSource(event.target.value))}
          readOnly={Boolean(activeExpressionDrag)}
          className="w-full bg-transparent px-2 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500/60 font-mono tracking-tight"
        />
      </div>
      {(isDragOver || isCustomDragOver) && (
        <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-10">
           <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-widest drop-shadow-md">Drop to Bind Instance Address</span>
        </div>
      )}
    </div>
  );
};

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
    <div className="space-y-4">
      <div className="relative group perspective-1000">
        {data.binding ? (
          <div className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 shadow-lg transition-all duration-500 hover:border-cyan-500/40 hover:shadow-[0_8px_30px_rgba(6,182,212,0.12)] bg-clip-padding backdrop-filter backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100 pointer-events-none" />
            
            {/* Header / Active Binding Toggle */}
            <div 
              className="relative p-4 flex items-center justify-between cursor-pointer"
              onClick={() => setIsBindingPickerOpen((prev) => !prev)}
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">Active Binding</div>
                <div className="text-lg text-slate-100 font-extrabold truncate tracking-tight mb-2 drop-shadow-sm flex items-center gap-2">
                  {data.binding.fullName}
                  <CheckCircle2 size={16} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <span className="bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-700/50">{data.binding.namespace || 'Global'}</span>
                  <span className="inline-flex items-center gap-1.5 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-700/50 text-cyan-300/80">
                    <Layers3 size={11} /> {data.binding.imageName}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 text-slate-400 transition-colors group-hover:bg-cyan-500/20 group-hover:text-cyan-300 group-hover:border-cyan-500/50">
                {isBindingPickerOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>

            {/* Integrated Instance Address field */}
            <div className="px-4 pb-4 pt-3 border-t border-slate-700/50 bg-slate-900/40 relative z-10">
               <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <span>Instance Address</span>
                  <span className="text-[9px] font-medium text-slate-500 tracking-normal normal-case">Optional if dynamically provided via flow</span>
               </div>
               <InstanceAddressInput 
                 value={data.instanceSource} 
                 onChange={(value) => updateData({ instanceSource: value })}
               />
            </div>
          </div>
        ) : (
          <div
            className="group cursor-pointer rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/60 p-5 shadow-[0_4px_25px_rgba(245,158,11,0.15)] transition-all hover:border-amber-400/50 hover:shadow-[0_8px_30px_rgba(245,158,11,0.2)]"
            onClick={() => setIsBindingPickerOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Action Required</div>
                <div className="text-base font-bold text-amber-100 leading-relaxed">This node is not bound yet.</div>
                <div className="text-amber-400/70 text-xs font-medium mt-1">Pick a concrete class below to resolve outputs.</div>
              </div>
              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 transition-colors group-hover:bg-amber-500/30">
                {isBindingPickerOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`transition-all duration-500 ease-in-out overflow-hidden origin-top ${isBindingPickerOpen ? 'max-h-[500px] opacity-100 scale-100 translate-y-0' : 'max-h-0 opacity-0 scale-95 -translate-y-2'}`}>
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative flex flex-col mt-2 ring-1 ring-white/5">
          <div className="px-4 py-3.5 border-b border-slate-800/80 bg-slate-950/40 relative">
            <Search size={16} className="text-cyan-400/70 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={bindingSearchQuery}
              onChange={(event) => setBindingSearchQuery(event.target.value)}
              placeholder="Search classes by name, namespace..."
              className="w-full bg-slate-950/60 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:bg-slate-950 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2 space-y-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/60 hover:[&::-webkit-scrollbar-thumb]:bg-cyan-500/40 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
            {filteredBindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Search size={32} className="mb-3 opacity-20" />
                <div className="text-sm font-medium">No classes found</div>
                <div className="text-xs opacity-60 mt-1">Try a different search term</div>
              </div>
            ) : (
              filteredBindings.map((entry) => {
                const isSelected = data.binding?.imageStableId === entry.imageStableId && data.binding?.classStableId === entry.classStableId;
                return (
                  <button
                    key={`${entry.imageStableId}::${entry.classStableId}`}
                    type="button"
                    className={`group w-full text-left p-3 rounded-xl border transition-all duration-300 flex flex-col gap-1.5
                      ${isSelected
                        ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]'
                        : 'border-transparent hover:border-cyan-500/40 hover:bg-cyan-900/10'}`}
                    onClick={() => handleBindClass(entry)}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-cyan-300' : 'text-slate-200 group-hover:text-cyan-400'}`}>
                        {entry.fullName}
                      </span>
                      {isSelected && <CheckCircle2 size={14} className="text-cyan-400 shrink-0 ml-2" />}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap font-medium">
                      <span className="bg-slate-950/40 px-1.5 py-0.5 rounded-md border border-slate-800/60">{entry.namespace || 'Global'}</span>
                      <span className="text-slate-700/50">•</span>
                      <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-500 transition-colors">
                        <Layers3 size={10} /> {entry.imageName}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};