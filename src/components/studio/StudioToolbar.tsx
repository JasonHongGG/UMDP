import React, { useMemo, useState } from 'react';
import { Download, FolderOpen, History, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useStudioGraph, useStudioRuntime } from '../../core/studio/StudioContext';
import { Tooltip } from '../common/Tooltip';

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
  } = useStudioGraph();
  useStudioRuntime();
  const [statusMessage, setStatusMessage] = useState<string>('');

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
            content={`Manual save: ${formatTimestamp(lastSavedAt)}\nAutosave: ${formatTimestamp(lastAutosavedAt)}\nLoad/undo anchor: ${formatTimestamp(lastLoadedAt)}`}
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
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="studio-toolbar-button"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="studio-toolbar-button"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={14} /> Redo
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="studio-toolbar-button studio-toolbar-button--accent"
            title="Save workflow (Ctrl+S)"
          >
            <Save size={14} /> Save
          </button>
          <button
            type="button"
            onClick={handleLoad}
            className="studio-toolbar-button"
            title="Load last saved workflow"
          >
            <FolderOpen size={14} /> Load
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="studio-toolbar-button"
            title="Clear current workflow"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 pointer-events-none">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-[#071018]/72 px-3 py-1 text-[11px] text-slate-500 backdrop-blur-xl">
          <History size={12} />
          <span>Shortcuts: Ctrl+S save, Ctrl+Z undo, Ctrl+Shift+Z redo</span>
        </div>
        {statusMessage ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100 backdrop-blur-xl">
            <Download size={12} />
            <span>{statusMessage}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}