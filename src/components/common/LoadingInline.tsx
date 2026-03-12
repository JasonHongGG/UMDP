import React from 'react';
import { LoaderCircle } from 'lucide-react';

export function LoadingInline({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-4 text-cyan-500 text-sm font-medium">
      <LoaderCircle size={16} className="animate-spin" />
      {msg}
    </div>
  );
}
