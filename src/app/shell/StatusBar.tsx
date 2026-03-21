import { Binary, Database } from 'lucide-react';
import type { WorkspaceLifecycleState } from '../../shared/contracts';
import { getWorkspaceLifecycleLabel, getWorkspaceLifecycleTone } from './workspaceLifecycle';

interface StatusBarProps {
  workspace: WorkspaceLifecycleState;
}

const toneClassMap = {
  ready: 'text-cyan-400',
  loading: 'text-amber-300',
  warning: 'text-amber-300',
  error: 'text-rose-400',
  idle: 'text-slate-500',
} as const;

export function StatusBar({ workspace }: StatusBarProps) {
  const tone = getWorkspaceLifecycleTone(workspace);
  const label = getWorkspaceLifecycleLabel(workspace);

  return (
    <div className="h-7 border-t border-[#1c2838] bg-[#05080c] flex items-center px-4 justify-between text-[10px] text-slate-500 shrink-0 select-none z-20 relative">
      <div className="flex items-center gap-4 uppercase tracking-wider font-semibold">
        <span className="flex items-center gap-1">
          <Binary size={12} className={toneClassMap[tone]} />
          {label}
        </span>
        {workspace.processSession ? (
          <span className="flex items-center gap-1">
            <Database size={12} className="text-blue-500" />
            {workspace.runtime} Runtime
          </span>
        ) : null}
      </div>
      <div className="truncate text-right text-slate-500">
        {workspace.processSession ? `${workspace.processSession.processName} (${workspace.processSession.pid})` : 'No process attached'}
      </div>
    </div>
  );
}
