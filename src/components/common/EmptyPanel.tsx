import React from 'react';

interface EmptyPanelProps {
  icon: React.ReactNode;
  title: string;
  msg: string;
  large?: boolean;
}

export function EmptyPanel({ icon, title, msg, large = false }: EmptyPanelProps) {
  return (
    <div className={`flex flex-col items-center justify-center h-full text-slate-500 gap-3 ${large ? 'scale-110' : ''} p-4 text-center`}>
      <div className="opacity-40">{icon}</div>
      <div className="flex flex-col">
        <span className={`font-semibold ${large ? 'text-lg text-slate-300' : 'text-sm text-slate-400'}`}>{title}</span>
        <span className="text-xs">{msg}</span>
      </div>
    </div>
  );
}
