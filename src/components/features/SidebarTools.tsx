import { Globe } from 'lucide-react';

interface SidebarToolsProps {
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
}

export function SidebarTools({ isGlobalSearchOpen, setIsGlobalSearchOpen }: SidebarToolsProps) {
  return (
    <div className="w-12 bg-[#05080c] border-r border-[#1c2838] flex flex-col items-center py-4 z-40 shrink-0 shadow-[4px_0_15px_rgba(0,0,0,0.3)] gap-3 relative">
      <button
        onClick={() => setIsGlobalSearchOpen(!isGlobalSearchOpen)}
        className={`p-2.5 rounded-lg transition-all relative group ${isGlobalSearchOpen ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'text-slate-500 hover:text-cyan-400 hover:bg-[#0a0f16]'}`}
        title="Global Search"
      >
        {isGlobalSearchOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
        <Globe className="w-5 h-5 transition-transform group-hover:scale-110" />
      </button>
    </div>
  );
}
