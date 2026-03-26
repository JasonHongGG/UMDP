import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Boxes, List, Type, Variable } from 'lucide-react';
import type { InspectorTab } from '@/domain/analysis/workspace-types';

interface InspectorTabBarProps {
  tabs: InspectorTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  handleCloseTab: (index: number, e: React.MouseEvent) => void;
  tabBarRef: React.RefObject<HTMLDivElement | null>;
}

export const InspectorTabBar = memo(function InspectorTabBar({
  tabs,
  activeTabIndex,
  setActiveTabIndex,
  handleCloseTab,
  tabBarRef
}: InspectorTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      ref={tabBarRef}
      className="flex items-end gap-1.5 px-6 pt-5 border-b border-[#1c2838] bg-[#070a0f]/80 backdrop-blur-xl shrink-0 overflow-x-auto relative z-30 shadow-[0_10px_30px_rgba(0,0,0,0.3)] min-h-[60px] slim-scrollbar"
    >
      <AnimatePresence>
        {tabs.map((tab, idx) => {
          const isActive = activeTabIndex === idx;

          let Icon = Boxes;
          const t = tab.namespace?.toLowerCase() || '';
          if (t.includes('struct') && !t.includes('class')) Icon = List;
          else if (t.includes('enum') || t === 'userenum') Icon = Type;
          else if (t.includes('function') || t.includes('delegate')) Icon = Variable;

          return (
            <motion.div
              key={`${tab.imageStableId}-${tab.classStableId}`}
              data-active={isActive}
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.8, transition: { duration: 0.2 } }}
              className="relative group flex items-center shrink-0 mb-[-1px]"
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCloseTab(idx, e as any);
                }
              }}
            >
              {isActive && (
                <>
                  <motion.div
                    layoutId="activeObjectTabBackground"
                    className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 via-cyan-900/10 to-transparent rounded-t-xl"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                  <motion.div
                    layoutId="activeObjectTabLine"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)] z-20"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                </>
              )}

              <button
                onClick={() => setActiveTabIndex(idx)}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-t-xl border-x border-t transition-all duration-300 z-10 w-48 overflow-hidden
                        ${isActive
                    ? 'border-cyan-500/30 text-white bg-[#0a0f16]/90 backdrop-blur-md shadow-[0_-5px_20px_rgba(34,211,238,0.1)]'
                    : 'border-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/5 hover:border-white/10'
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-slate-500'}`} />

                <div className="flex flex-col items-start flex-1 min-w-0 pr-5">
                  <span className="text-[12px] font-bold tracking-widest truncate w-full text-left font-mono">{tab.name}</span>
                </div>
              </button>

              <button
                onClick={(e) => handleCloseTab(idx, e)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 z-20 overflow-hidden
                        bg-transparent text-transparent
                        group-hover:bg-rose-500/20 group-hover:text-rose-400 hover:!bg-rose-500 hover:!text-white hover:shadow-[0_0_15px_rgba(244,63,94,0.6)]
                        ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        ${!isActive && 'pointer-events-none group-hover:pointer-events-auto'}
                    `}
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});
