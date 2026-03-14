import { ScanSearch, LayoutDashboard } from 'lucide-react';

interface TopNavigationProps {
  activePage: 'inspector' | 'studio';
  onPageChange: (page: 'inspector' | 'studio') => void;
}

export function TopNavigation({ activePage, onPageChange }: TopNavigationProps) {
  return (
    <div 
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center p-1 rounded-xl bg-[#0a0f16]/80 border border-[#1c2838] shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md z-50"
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <div className="relative flex">
        {/* Animated Background Pill */}
        <div 
          className="absolute top-0 bottom-0 w-[110px] bg-cyan-500/15 border border-cyan-500/30 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none"
          style={{
            transform: `translateX(${activePage === 'inspector' ? '0' : '100%'})`,
            left: activePage === 'inspector' ? '0' : '4px' // adjusting gap
          }}
        >
          {/* Inner Glow */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-cyan-500/0 opacity-50 block mix-blend-screen" />
        </div>

        {/* Buttons */}
        <button
          onClick={() => onPageChange('inspector')}
          className={`relative w-[110px] py-1.5 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 z-10 ${
            activePage === 'inspector' 
              ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ScanSearch size={14} className={activePage === 'inspector' ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''} />
          Inspector
        </button>

        <div className="w-1" /> {/* Gap between buttons */}

        <button
          onClick={() => onPageChange('studio')}
          className={`relative w-[110px] py-1.5 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 z-10 ${
            activePage === 'studio' 
              ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <LayoutDashboard size={14} className={activePage === 'studio' ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''} />
          Studio
        </button>
      </div>
    </div>
  );
}
