import { MousePointerClick } from 'lucide-react';
import { Tooltip, TooltipPanel } from '@/shared/ui/Tooltip';

interface SceneSidebarToolsProps {
  isMousePickerOpen: boolean;
  setIsMousePickerOpen: (open: boolean) => void;
}

export function SceneSidebarTools({
  isMousePickerOpen,
  setIsMousePickerOpen,
}: SceneSidebarToolsProps) {
  return (
    <div className="w-12 bg-[#05080c] border-r border-[#1c2838] flex flex-col items-center py-4 z-40 shrink-0 shadow-[4px_0_15px_rgba(0,0,0,0.3)] gap-3 relative">
      <Tooltip position="right" content={<TooltipPanel label="Mouse Picker" description="Pick a scene object directly from the runtime game view." tone={isMousePickerOpen ? 'accent' : 'default'} />}>
        <span className="inline-flex">
          <button
            onClick={() => setIsMousePickerOpen(!isMousePickerOpen)}
            aria-label="Mouse Picker"
            className={`p-2.5 rounded-lg transition-all relative group ${isMousePickerOpen ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'text-slate-500 hover:text-cyan-400 hover:bg-[#0a0f16]'}`}
          >
            {isMousePickerOpen && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
            <MousePointerClick className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </span>
      </Tooltip>
    </div>
  );
}