import type { WorkspacePageDetail } from '@/domain/workspace/presentation';

const toneClassMap = {
  ready: 'text-cyan-300/80',
  loading: 'text-amber-300/80',
  warning: 'text-amber-300/80',
  error: 'text-rose-300/80',
  idle: 'text-slate-400/80',
} as const;

export function WorkspaceGate({ detail }: { detail: WorkspacePageDetail }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400">
      <div className="max-w-xl px-6 text-center space-y-3">
        <div className={`text-[11px] uppercase tracking-[0.28em] ${toneClassMap[detail.tone]}`}>
          {detail.badge}
        </div>
        <div className="text-lg font-semibold text-slate-100">{detail.title}</div>
        <div className="text-sm leading-6 text-slate-400">{detail.description}</div>
      </div>
    </div>
  );
}