import { Binary, Database } from 'lucide-react';
import type { WorkspacePresentation } from '@/domain/workspace/presentation';

interface StatusBarProps {
  presentation: WorkspacePresentation;
}

const toneClassMap = {
  ready: 'text-cyan-400',
  loading: 'text-amber-300',
  warning: 'text-amber-300',
  error: 'text-rose-400',
  idle: 'text-slate-500',
} as const;

export function StatusBar({ presentation }: StatusBarProps) {
  const tone = presentation.lifecycleTone;

  return (
    <div className="h-7 border-t border-[#1c2838] bg-[#05080c] flex items-center px-4 justify-between text-[10px] text-slate-500 shrink-0 select-none z-20 relative">
      <div className="flex items-center gap-4 uppercase tracking-wider font-semibold">
        <span className="flex items-center gap-1">
          <Binary size={12} className={toneClassMap[tone]} />
          {presentation.lifecycleLabel}
        </span>
        {presentation.runtimeFlavorLabel ? (
          <span className="flex items-center gap-1">
            <Database size={12} className="text-blue-500" />
            {presentation.runtimeFlavorLabel}
          </span>
        ) : null}
        <span className={`flex items-center gap-1 ${presentation.runtimeTone === 'ready' ? 'text-emerald-400' : toneClassMap[presentation.runtimeTone]}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
          {presentation.runtimeLabel}
        </span>
      </div>
      <div className="truncate text-right text-slate-500">{presentation.detailMessage}</div>
    </div>
  );
}
