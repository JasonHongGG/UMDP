import { Binary, Database } from 'lucide-react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
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

function formatRuntimeSessionLabel(workspace: WorkspaceLifecycleState) {
  const { runtimeSession } = workspace;
  switch (runtimeSession.status) {
    case 'ready':
      return 'Runtime Ready';
    case 'starting':
      return 'Runtime Starting';
    case 'recovering':
      return 'Runtime Recovering';
    case 'degraded':
      return 'Runtime Degraded';
    case 'error':
      return 'Runtime Error';
    case 'idle':
    default:
      return 'Runtime Idle';
  }
}

export function StatusBar({ workspace }: StatusBarProps) {
  const tone = getWorkspaceLifecycleTone(workspace);
  const label = getWorkspaceLifecycleLabel(workspace);
  const runtimeLabel = formatRuntimeSessionLabel(workspace);

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
        <span className={`flex items-center gap-1 ${workspace.runtimeSession.bridgeConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
          {runtimeLabel}
        </span>
      </div>
      <div className="truncate text-right text-slate-500">
        {workspace.runtimeSession.lastError
          ? workspace.runtimeSession.lastError
          : workspace.processSession
            ? `${workspace.processSession.processName} (${workspace.processSession.pid})`
            : 'No process attached'}
      </div>
    </div>
  );
}
