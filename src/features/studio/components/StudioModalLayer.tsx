import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useStudioFeedback } from '@/features/studio/application/feedback/StudioFeedbackContext';
import { ExpressionDragOverlay } from '@/features/studio/core/drag/ExpressionDragOverlay';
import { AddNodeModal } from './modals/AddNodeModal';
import { EditNodeModal } from './modals/EditNodeModal';

export function StudioModalLayer() {
  const { runtimeFeedback, clearRuntimeFeedback } = useStudioFeedback();

  return (
    <>
      <AddNodeModal />
      <EditNodeModal />
      <ExpressionDragOverlay />
      {runtimeFeedback ? (
        <div className="absolute right-4 bottom-4 z-30 max-w-sm rounded-2xl border border-rose-500/20 bg-[#120b0d]/95 px-4 py-3 text-sm text-rose-50 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <AlertTriangle size={16} className="mt-0.5 text-rose-300 shrink-0" />
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] uppercase tracking-[0.24em] text-rose-300/80">Runtime feedback</div>
                <div className="font-semibold text-rose-100">{runtimeFeedback.title}</div>
                <div className="text-xs leading-5 text-rose-100/80">{runtimeFeedback.description}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearRuntimeFeedback}
              className="rounded-full border border-rose-400/20 p-1 text-rose-200/80 transition hover:bg-rose-400/10 hover:text-rose-100"
              aria-label="Dismiss runtime feedback"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}