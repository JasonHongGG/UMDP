import React, { useMemo, useState } from 'react';
import { Cpu, Download, FolderOpen, History, Play, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useStudioGraph, useStudioRuntime } from '../../core/studio/StudioContext';
import { useAnalysisWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

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
  const { activeRun, runHistory } = useStudioRuntime();
  const { workspaceLifecycle } = useAnalysisWorkspace();
  const [statusMessage, setStatusMessage] = useState<string>('');

  const countsLabel = useMemo(() => `${nodes.length} nodes · ${edges.length} edges`, [edges.length, nodes.length]);
  const runtimeLabel = workspaceLifecycle.runtime === 'unknown'
    ? 'Runtime Unknown'
    : workspaceLifecycle.runtime === 'mono'
      ? 'Mono Runtime'
      : 'IL2CPP Runtime';
  const runLabel = activeRun
    ? `Run ${activeRun.status.toUpperCase()} · ${activeRun.startNodeId}`
    : runHistory[0]
      ? `Last Run ${runHistory[0].status.toUpperCase()}`
      : 'No Runs Yet';

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
      <div className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-[#071018]/88 backdrop-blur-xl px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] border ${hasUnsavedChanges ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            {hasUnsavedChanges ? 'Dirty' : 'Saved'}
          </div>
          <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 inline-flex items-center gap-1.5">
            <Cpu size={12} /> {runtimeLabel}
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] border inline-flex items-center gap-1.5 ${activeRun ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900/70 text-slate-400'}`}>
            <Play size={12} /> {runLabel}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Studio Workflow</div>
            <div className="text-[11px] text-slate-500 truncate">{countsLabel}</div>
          </div>
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500">
            <span>Manual save: {formatTimestamp(lastSavedAt)}</span>
            <span>Autosave: {formatTimestamp(lastAutosavedAt)}</span>
            <span>Load/undo anchor: {formatTimestamp(lastLoadedAt)}</span>
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