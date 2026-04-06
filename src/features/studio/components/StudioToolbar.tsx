import React, { useMemo, useState } from 'react';
import { Download, FolderOpen, History, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useStudioToolbarState } from '@/features/studio/application/useStudioToolbarState';
import { useStudioFeedback } from '@/features/studio/application/feedback/StudioFeedbackContext';
import { Tooltip, TooltipPanel } from '@/shared/ui/Tooltip';

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return 'Never';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}

export function StudioToolbar() {
  const {
    nodes,
    edges,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    hasSavedWorkflow,
    lastSavedAt,
    lastLoadedAt,
    lastAutosavedAt,
    undo,
    redo,
    saveWorkflow,
    loadSavedWorkflow,
    clearWorkflow,
  } = useStudioToolbarState();
  const { documentFeedback } = useStudioFeedback();
  const [statusMessage, setStatusMessage] = useState<string>('');
  const shellFeedback = useMemo(() => {
    if (statusMessage) {
      return {
        className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
        icon: <Download size={12} />,
        message: statusMessage,
      };
    }

    if (!documentFeedback) {
      return null;
    }

    const toneClassName = documentFeedback.tone === 'error'
      ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
      : documentFeedback.tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
        : documentFeedback.tone === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
          : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100';

    return {
      className: toneClassName,
      icon: <Download size={12} />,
      message: `${documentFeedback.title}: ${documentFeedback.description}`,
    };
  }, [documentFeedback, statusMessage]);

  const handleSave = () => {
    setStatusMessage(saveWorkflow() ? 'Workflow saved to local draft slot.' : 'Save failed.');
  };

  const handleLoad = () => {
    if (!hasSavedWorkflow) {
      setStatusMessage('No saved workflow snapshot is available yet.');
      return;
    }

    const shouldLoad = window.confirm('Load the last saved workflow snapshot and replace the current canvas?');
    if (!shouldLoad) {
      return;
    }

    setStatusMessage(loadSavedWorkflow() ? 'Saved workflow snapshot restored.' : 'Saved workflow snapshot could not be loaded.');
  };

  const handleClear = () => {
    const shouldClear = window.confirm('Clear the current workflow canvas and discard the local saved/autosaved drafts?');
    if (!shouldClear) {
      return;
    }

    clearWorkflow();
    setStatusMessage('Workflow canvas cleared.');
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
      <div className="pointer-events-auto flex items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-[#071018]/88 backdrop-blur-xl px-4 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-4 min-w-0">
          <Tooltip 
            position="bottom" 
            content={(
              <TooltipPanel
                label={hasUnsavedChanges ? 'Unsaved Changes' : 'Saved Snapshot'}
                description={`Manual save: ${formatTimestamp(lastSavedAt)}`}
                detail={`Autosave: ${formatTimestamp(lastAutosavedAt)}\nLoad / undo anchor: ${formatTimestamp(lastLoadedAt)}`}
                tone={hasUnsavedChanges ? 'warning' : 'success'}
              />
            )}
          >
            <div 
              className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[11px] font-bold uppercase tracking-[0.15em] transition-colors cursor-help
                ${hasUnsavedChanges ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                ${hasUnsavedChanges ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'}`} 
              />
              {hasUnsavedChanges ? 'Unsaved' : 'Saved'}
            </div>
          </Tooltip>

          <div className="w-px h-5 bg-slate-700/60 hidden sm:block" />

          <div className="min-w-0 flex items-baseline gap-3">
            <h1 className="text-[13px] font-bold text-slate-200 tracking-wide uppercase">Studio Workflow</h1>
            <div className="text-[11px] font-medium text-slate-500/80 tracking-wide truncate hidden sm:block">
              {nodes.length} nodes <span className="mx-1.5 opacity-40">•</span> {edges.length} edges
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Tooltip position="bottom" content={<TooltipPanel label="Undo" description="Revert the most recent workflow edit." shortcut="Ctrl+Z" tone="muted" />}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="studio-toolbar-button"
                aria-label="Undo"
              >
                <Undo2 size={14} /> Undo
              </button>
            </span>
          </Tooltip>
          <Tooltip position="bottom" content={<TooltipPanel label="Redo" description="Reapply the last reverted workflow edit." shortcut="Ctrl+Shift+Z" tone="muted" />}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="studio-toolbar-button"
                aria-label="Redo"
              >
                <Redo2 size={14} /> Redo
              </button>
            </span>
          </Tooltip>
          <Tooltip position="bottom" content={<TooltipPanel label="Save Workflow" description="Store the current workflow into the local draft slot." shortcut="Ctrl+S" tone="accent" />}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={handleSave}
                className="studio-toolbar-button studio-toolbar-button--accent"
                aria-label="Save Workflow"
              >
                <Save size={14} /> Save
              </button>
            </span>
          </Tooltip>
          <Tooltip position="bottom" content={<TooltipPanel label="Load Saved Workflow" description="Restore the last saved workflow snapshot into the canvas." tone="default" />}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={handleLoad}
                className="studio-toolbar-button"
                aria-label="Load Saved Workflow"
              >
                <FolderOpen size={14} /> Load
              </button>
            </span>
          </Tooltip>
          <Tooltip position="bottom" content={<TooltipPanel label="Reset Workflow" description="Clear the current canvas and discard saved and autosaved drafts." tone="danger" />}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={handleClear}
                className="studio-toolbar-button"
                aria-label="Reset Workflow"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 pointer-events-none">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-[#071018]/72 px-3 py-1 text-[11px] text-slate-500 backdrop-blur-xl">
          <History size={12} />
          <span>Shortcuts: Ctrl+S save, Ctrl+Z undo, Ctrl+Shift+Z redo</span>
        </div>
        {shellFeedback ? (
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] backdrop-blur-xl ${shellFeedback.className}`}>
            {shellFeedback.icon}
            <span>{shellFeedback.message}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}