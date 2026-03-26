import { Search, LoaderCircle, Database, Globe, X } from 'lucide-react';
import type { GlobalSearchResult } from '@/domain/analysis/view-models';

interface GlobalSearchSidebarProps {
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
  globalSearchMode: 'Class' | 'Field' | 'StaticField' | 'Method';
  setGlobalSearchMode: (mode: 'Class' | 'Field' | 'StaticField' | 'Method') => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  isGlobalSearching: boolean;
  globalSearchResults: GlobalSearchResult[];
  handleGlobalSearchResultClick: (res: GlobalSearchResult) => void;
}

export function GlobalSearchSidebar({
  isGlobalSearchOpen,
  setIsGlobalSearchOpen,
  globalSearchMode,
  setGlobalSearchMode,
  globalSearchQuery,
  setGlobalSearchQuery,
  isGlobalSearching,
  globalSearchResults,
  handleGlobalSearchResultClick
}: GlobalSearchSidebarProps) {
  return (
    <div className={`flex flex-col bg-[#070a0f]/95 backdrop-blur-xl relative z-20 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden border-r border-[#1c2838] shadow-[10px_0_30px_rgba(0,0,0,0.5)] ${isGlobalSearchOpen ? 'w-[320px]' : 'w-0 border-r-0 shadow-none opacity-0'}`}>
      <div className="p-4 border-b border-[#1c2838] shrink-0 w-[320px]">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-200 flex-1">Global Search</span>
          <button onClick={() => setIsGlobalSearchOpen(false)} className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-rose-500/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-[#05080c]/80 rounded-lg p-1 border border-[#1c2838] mb-4 shadow-inner">
          <button
            onClick={() => setGlobalSearchMode("Class")}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${globalSearchMode === 'Class' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Classes
          </button>
          <button
            onClick={() => setGlobalSearchMode("Field")}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${globalSearchMode === 'Field' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Fields
          </button>
          <button
            onClick={() => setGlobalSearchMode("StaticField")}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${globalSearchMode === 'StaticField' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Statics
          </button>
          <button
            onClick={() => setGlobalSearchMode("Method")}
            className={`text-[10px] uppercase tracking-widest py-1.5 rounded-md transition-all font-bold ${globalSearchMode === 'Method' ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Methods
          </button>
        </div>

        <div className="relative group">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${globalSearchQuery ? 'text-cyan-400' : 'text-slate-500 group-focus-within:text-cyan-400'}`} />
          <input
            type="text"
            placeholder="SEARCH MEMORY..."
            value={globalSearchQuery}
            onChange={e => setGlobalSearchQuery(e.target.value)}
            className="w-full bg-[#05080c]/60 border border-[#1c2838] rounded-lg text-[11px] py-2 pl-9 pr-3 outline-none focus:border-cyan-500/50 focus:bg-[#070a0f]/90 focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] transition-all text-slate-100 placeholder:text-slate-600 font-mono tracking-wide"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 slim-scrollbar w-[320px]">
        {isGlobalSearching ? (
          <div className="flex flex-col items-center justify-center h-48 text-cyan-500/50 gap-4">
            <LoaderCircle className="w-8 h-8 animate-spin opacity-80" />
            <span className="text-[10px] font-mono tracking-widest font-bold">SCANNING MEMORY...</span>
          </div>
        ) : globalSearchResults.length > 0 ? (
          globalSearchResults.map((res, i) => (
            <button
              key={i}
              onClick={() => handleGlobalSearchResultClick(res)}
              className="w-full text-left px-3 py-2.5 text-[11px] rounded-lg transition-all bg-[#0a0f16]/30 hover:bg-[#0a0f16]/90 border border-transparent hover:border-white/5 group flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border shrink-0
                  bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                  {res.matchType === 'StaticField' ? 'Static' : res.matchType}
                </span>
                <span className="font-semibold text-slate-100 truncate leading-tight">
                  {res.matchText}
                </span>
              </div>
              <div className="flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity gap-2 mt-0.5">
                {res.matchType !== 'Class' && (
                  <span className="font-mono text-[9px] text-cyan-400/80 truncate flex-1 text-left">{res.className}</span>
                )}
                <span className={`text-[9px] tracking-wider text-slate-500 truncate text-right ${res.matchType === 'Class' ? 'w-full' : 'shrink-0 max-w-[140px]'}`}>
                  {res.imageName}
                </span>
              </div>
            </button>
          ))
        ) : globalSearchQuery.length >= 2 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3">
            <Search className="w-8 h-8 opacity-20" />
            <div className="text-[10px] uppercase font-mono tracking-widest font-bold">NO MATCHES FOUND</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3 px-6 text-center">
            <Database className="w-8 h-8 opacity-20 mb-1" />
            <div className="text-[10px] uppercase font-mono tracking-wider leading-relaxed">
              INITIALIZE QUERY<br /><span className="opacity-50 text-[9px]">MINIMUM 2 CHARACTERS</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
