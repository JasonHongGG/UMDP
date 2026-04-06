import { Globe, Waypoints } from 'lucide-react';
import { Tooltip, TooltipPanel } from '@/shared/ui/Tooltip';

interface SidebarToolsProps {
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
  isReferenceOpen: boolean;
  setIsReferenceOpen: (open: boolean) => void;
}

export function SidebarTools({
  isGlobalSearchOpen,
  setIsGlobalSearchOpen,
  isReferenceOpen,
  setIsReferenceOpen,
}: SidebarToolsProps) {
  return (
    <div className="w-12 bg-[#05080c] border-r border-[#1c2838] flex flex-col items-center py-4 z-40 shrink-0 shadow-[4px_0_15px_rgba(0,0,0,0.3)] gap-3 relative">
      {/* Global Search */}
      <Tooltip position="right" content={<TooltipPanel label="Global Search" description="Search the loaded metadata catalog across assemblies and classes." tone={isGlobalSearchOpen ? 'accent' : 'default'} />}>
        <span className="inline-flex">
          <button
            onClick={() => {
              const next = !isGlobalSearchOpen;
              setIsGlobalSearchOpen(next);
              if (next) setIsReferenceOpen(false);
            }}
            aria-label="Global Search"
            className={`p-2.5 rounded-lg transition-all relative group ${isGlobalSearchOpen ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'text-slate-500 hover:text-cyan-400 hover:bg-[#0a0f16]'}`}
          >
            {isGlobalSearchOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
            <Globe className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </span>
      </Tooltip>

      {/* Class References */}
      <Tooltip position="right" content={<TooltipPanel label="Class References" description="Trace inheritance, member, and function references for the selected class." tone={isReferenceOpen ? 'accent' : 'default'} />}>
        <span className="inline-flex">
          <button
            onClick={() => {
              const next = !isReferenceOpen;
              setIsReferenceOpen(next);
              if (next) setIsGlobalSearchOpen(false);
            }}
            aria-label="Class References"
            className={`p-2.5 rounded-lg transition-all relative group ${isReferenceOpen ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'text-slate-500 hover:text-cyan-400 hover:bg-[#0a0f16]'}`}
          >
            {isReferenceOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
            <Waypoints className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </span>
      </Tooltip>
    </div>
  );
}
