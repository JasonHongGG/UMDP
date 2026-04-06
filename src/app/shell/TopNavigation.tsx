import { Boxes, LayoutDashboard, ScanSearch } from 'lucide-react';
import type { WorkspacePresentation } from '@/domain/workspace/presentation';
import { Tooltip, TooltipPanel } from '@/shared/ui/Tooltip';

const NAV_ITEMS = [
  { key: 'inspector', label: 'Inspector', icon: ScanSearch },
  { key: 'scene', label: 'Scene', icon: Boxes },
  { key: 'studio', label: 'Studio', icon: LayoutDashboard },
] as const;

interface TopNavigationProps {
  activePage: 'inspector' | 'studio' | 'scene';
  onPageChange: (page: 'inspector' | 'studio' | 'scene') => void;
  pages: WorkspacePresentation['pages'];
}

export function TopNavigation({ activePage, onPageChange, pages }: TopNavigationProps) {
  const activeIndex = NAV_ITEMS.findIndex((item) => item.key === activePage);

  return (
    <div 
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center p-1 rounded-xl bg-[#0a0f16]/80 border border-[#1c2838] shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md z-50"
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <div className="relative flex">
        <div 
          className="absolute top-0 bottom-0 w-[110px] bg-cyan-500/15 border border-cyan-500/30 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none"
          style={{
            transform: `translateX(${activeIndex * 114}px)`,
            left: 0,
          }}
        >
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-cyan-500/0 opacity-50 block mix-blend-screen" />
        </div>

        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const active = item.key === activePage;
          const detail = pages[item.key];
          const disabled = item.key !== 'inspector' && detail.sessionReady && detail.catalogReady && !detail.capabilityAvailable;

          return (
            <div key={item.key} className={index > 0 ? 'ml-1' : ''}>
              <Tooltip
                position="bottom"
                content={(
                  <TooltipPanel
                    label={item.label}
                    description={detail.description}
                    detail={disabled ? 'Current runtime session does not expose this capability.' : active ? 'Current workspace page.' : 'Switch workspace page.'}
                    tone={disabled ? 'warning' : active ? 'accent' : 'default'}
                  />
                )}
              >
                <span className="block">
                  <button
                    onClick={() => {
                      if (!disabled) {
                        onPageChange(item.key);
                      }
                    }}
                    disabled={disabled}
                    aria-label={item.label}
                    className={`relative w-[110px] py-1.5 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 z-10 ${
                      active
                        ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                        : disabled
                          ? 'text-slate-700 cursor-not-allowed'
                          : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Icon size={14} className={active ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''} />
                    {item.label}
                  </button>
                </span>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
