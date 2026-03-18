import { Search, LoaderCircle, Database, X, Waypoints } from 'lucide-react';
import type { ClassReferenceResult } from '../../domain/analysis/view-models';

type ReferenceMode = 'Inheritance' | 'Member' | 'Function';

interface ClassReferenceSidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  searchMode: ReferenceMode;
  setSearchMode: (mode: ReferenceMode) => void;
  targetInput: string;
  setTargetInput: (val: string) => void;
  targetError: string | null;
  results: ClassReferenceResult[];
  isSearching: boolean;
  executeSearch: () => void;
  handleResultClick: (res: ClassReferenceResult) => void;
}

export function ClassReferenceSidebar({
  isOpen,
  setIsOpen,
  searchMode,
  setSearchMode,
  targetInput,
  setTargetInput,
  targetError,
  results,
  isSearching,
  executeSearch,
  handleResultClick,
}: ClassReferenceSidebarProps) {
  return (
    <div className={`flex flex-col bg-[#070a0f]/95 backdrop-blur-xl relative z-20 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden border-r border-[#1c2838] shadow-[10px_0_30px_rgba(0,0,0,0.5)] ${isOpen ? 'w-[320px]' : 'w-0 border-r-0 shadow-none opacity-0'}`}>
      <div className="p-4 border-b border-[#1c2838] shrink-0 w-[320px]">
        <div className="flex items-center gap-2 mb-4">
          <Waypoints className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-200 flex-1">Class References</span>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-rose-500/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-[#05080c]/80 rounded-lg p-1 border border-[#1c2838] mb-4 shadow-inner">
          <button
            onClick={() => setSearchMode('Inheritance')}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${searchMode === 'Inheritance' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Inherit
          </button>
          <button
            onClick={() => setSearchMode('Member')}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${searchMode === 'Member' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Member
          </button>
          <button
            onClick={() => setSearchMode('Function')}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${searchMode === 'Function' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Function
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group flex-1">
            <Waypoints className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${targetInput ? 'text-cyan-400' : 'text-slate-500 group-focus-within:text-cyan-400'}`} />
            <input
              type="text"
              placeholder="TARGET CLASS (full name)..."
              value={targetInput}
              onChange={e => {
                setTargetInput(e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') executeSearch();
              }}
              className="w-full bg-[#05080c]/60 border border-[#1c2838] rounded-lg text-[11px] py-2 pl-9 pr-3 outline-none focus:border-cyan-500/50 focus:bg-[#070a0f]/90 focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] transition-all text-slate-100 placeholder:text-slate-600 font-mono tracking-wide"
            />
          </div>
          <button
            onClick={executeSearch}
            disabled={!targetInput.trim() || isSearching}
            className="flex items-center justify-center p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500 hover:text-white hover:shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="Search References"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {targetError && (
          <div className="mt-3 text-[10px] text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {targetError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 slim-scrollbar w-[320px]">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center h-48 text-cyan-500/50 gap-4">
            <LoaderCircle className="w-8 h-8 animate-spin opacity-80" />
            <span className="text-[10px] font-mono tracking-widest font-bold">SCANNING REFERENCES...</span>
          </div>
        ) : results.length > 0 ? (
          results.map((res, i) => (
            <button
              key={i}
              onClick={() => handleResultClick(res)}
              className="w-full text-left px-3 py-2.5 text-[11px] rounded-lg transition-all bg-[#0a0f16]/30 hover:bg-[#0a0f16]/90 border border-transparent hover:border-white/5 group flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border shrink-0
                  bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                  {res.matchType}
                </span>
                <span className="font-semibold text-slate-100 truncate leading-tight">
                  {res.className}
                </span>
              </div>
              <div className="flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity gap-2 mt-0.5">
                <span className="font-mono text-[9px] text-cyan-400/80 truncate flex-1 text-left">{res.matchDetail}</span>
                <span className="text-[9px] tracking-wider text-slate-500 truncate shrink-0 max-w-[140px] text-right">
                  {res.imageName}
                </span>
              </div>
            </button>
          ))
        ) : targetInput.length > 0 && !targetError ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3">
            <Search className="w-8 h-8 opacity-20" />
            <div className="text-[10px] uppercase font-mono tracking-widest font-bold">NO REFERENCES FOUND</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3 px-6 text-center">
            <Database className="w-8 h-8 opacity-20 mb-1" />
            <div className="text-[10px] uppercase font-mono tracking-wider leading-relaxed">
              INPUT TARGET CLASS<br /><span className="opacity-50 text-[9px]">PRESS SEARCH TO SCAN</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
