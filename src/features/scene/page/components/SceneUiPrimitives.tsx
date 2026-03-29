import type { ReactNode } from 'react';

export function ActionButton({
  title,
  icon,
  onClick,
  disabled,
  tone = 'default',
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${tone === 'danger'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
        : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
        }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
    </button>
  );
}

export function ObjectLinkCard({
  title,
  address,
  meta,
  onClick,
  tone = 'default',
}: {
  title: string;
  address: string;
  meta?: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
}) {
  const className = tone === 'danger'
    ? 'border-rose-500/20 bg-rose-950/20 hover:border-rose-500/35 hover:bg-rose-950/30'
    : 'border-[#1c2838] bg-[#0a1018] hover:border-cyan-500/30 hover:bg-[#0d1520]';

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-200 truncate">{title}</div>
          <div className="text-[11px] text-slate-500 mt-1 break-all">{address}</div>
        </div>
        {meta ? <div className="text-[11px] text-slate-500 shrink-0">{meta}</div> : null}
      </div>
    </>
  );

  if (!onClick) {
    return <div className={`w-full rounded-xl border px-3 py-3 text-left ${className}`}>{content}</div>;
  }

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${className}`}
    >
      {content}
    </button>
  );
}

export function SceneCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#1b2737] bg-[#0b1119]/90 shadow-[0_20px_40px_rgba(0,0,0,0.25)] px-5 py-5">
      <div className="flex items-center gap-2 text-sm text-slate-200 font-medium mb-4">
        <span className="text-cyan-300">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3 flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 break-all text-right">{value}</span>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
      {message}
    </div>
  );
}

export function EmptyNotice({ message }: { message: string }) {
  return <div className="text-sm text-slate-500">{message}</div>;
}
