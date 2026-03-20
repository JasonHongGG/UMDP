import React, { useMemo, useState } from 'react';
import { ActivitySquare, AlertTriangle, Eye, PlayCircle } from 'lucide-react';
import { Port } from '../../components/studio/canvas/Port';
import { useStudioQuery, useStudioRuntime } from '../../core/studio/StudioContext';
import type { INodeComponentProps } from '../../core/studio/types';
import type { DisplayNodeQueryState, NodeExecutionSnapshot, WorkflowJsonEnvelope, WorkflowJsonValue } from '../../domain/studio/contracts';
import { createPayloadSummary, formatMetaValue, type DisplayNodeData } from './displayNodeModel';

interface ResolvedDisplayState {
  sourceKind: 'runtime' | 'preview' | 'empty';
  status: 'idle' | 'running' | 'success' | 'error';
  envelope: WorkflowJsonEnvelope | null;
  summaryText: string;
  countText: string | null;
  schemaText: string | null;
  metaEntries: Array<[string, WorkflowJsonValue]>;
  issueText: string | null;
}

function getRuntimeEnvelope(snapshot: NodeExecutionSnapshot | undefined) {
  return snapshot?.inputs['payload-in']?.[0] ?? null;
}

function buildResolvedState(
  data: DisplayNodeData,
  snapshot: NodeExecutionSnapshot | undefined,
  previewState: DisplayNodeQueryState | null,
): ResolvedDisplayState {
  const runtimeEnvelope = getRuntimeEnvelope(snapshot);
  if (snapshot && runtimeEnvelope) {
    const summary = createPayloadSummary(runtimeEnvelope.payload, data.truncateAt);
    return {
      sourceKind: 'runtime',
      status: snapshot.status,
      envelope: runtimeEnvelope,
      summaryText: summary.previewText,
      countText: summary.entryCount !== undefined ? `${summary.entryCount} item${summary.entryCount === 1 ? '' : 's'}` : null,
      schemaText: data.showSchema ? `${runtimeEnvelope.schema.id}@v${runtimeEnvelope.schema.version}` : null,
      metaEntries: data.showMeta ? Object.entries(runtimeEnvelope.meta ?? {}) : [],
      issueText: snapshot.errorMessage ?? snapshot.issues?.[0]?.message ?? null,
    };
  }

  if (snapshot?.status === 'running') {
    return {
      sourceKind: 'runtime',
      status: 'running',
      envelope: null,
      summaryText: 'Executing node and waiting for runtime payload.',
      countText: null,
      schemaText: null,
      metaEntries: [],
      issueText: null,
    };
  }

  if (previewState?.kind === 'resolved') {
    const summary = previewState.summary;
    return {
      sourceKind: 'preview',
      status: 'success',
      envelope: previewState.envelope,
      summaryText: summary.previewText,
      countText: summary.entryCount !== undefined ? `${summary.entryCount} item${summary.entryCount === 1 ? '' : 's'}` : null,
      schemaText: data.showSchema ? `${previewState.envelope.schema.id}@v${previewState.envelope.schema.version}` : null,
      metaEntries: data.showMeta ? Object.entries(previewState.envelope.meta ?? {}) : [],
      issueText: null,
    };
  }

  return {
    sourceKind: 'empty',
    status: snapshot?.status ?? 'idle',
    envelope: null,
    summaryText: previewState?.issues[0]?.message ?? 'No runtime result yet.',
    countText: null,
    schemaText: null,
    metaEntries: [],
    issueText: previewState?.issues[0]?.message ?? null,
  };
}

function renderJsonValue(value: WorkflowJsonValue, truncateAt: number, depth = 0): React.ReactNode {
  if (depth > 1) {
    return <span className="text-slate-500">...</span>;
  }

  if (value === null) {
    return <span className="text-slate-500">null</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-1">
        {value.slice(0, 4).map((entry, index) => (
          <div key={index} className="text-[11px] text-slate-300">
            <span className="text-slate-500 mr-2">[{index}]</span>
            {renderJsonValue(entry, truncateAt, depth + 1)}
          </div>
        ))}
        {value.length > 4 ? <div className="text-[10px] text-slate-500">+{value.length - 4} more</div> : null}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return (
      <div className="space-y-1">
        {entries.slice(0, 5).map(([key, entryValue]) => (
          <div key={key} className="text-[11px] text-slate-300 flex gap-2">
            <span className="text-cyan-300 shrink-0">{key}</span>
            <span className="text-slate-500 shrink-0">:</span>
            <span className="min-w-0">{renderJsonValue(entryValue, truncateAt, depth + 1)}</span>
          </div>
        ))}
        {entries.length > 5 ? <div className="text-[10px] text-slate-500">+{entries.length - 5} more</div> : null}
      </div>
    );
  }

  const text = typeof value === 'string' && value.length > truncateAt ? `${value.slice(0, truncateAt)}...` : String(value);
  return <span className="text-slate-200">{text}</span>;
}

export const DisplayNodeCanvas: React.FC<INodeComponentProps<DisplayNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeSnapshots } = useStudioRuntime();
  const query = useStudioQuery();
  const [isExpanded, setIsExpanded] = useState(Boolean(data.expandedByDefault));

  const previewState = query.getNodeQueryState<DisplayNodeQueryState>(id);
  const resolvedState = useMemo(
    () => buildResolvedState(data, nodeSnapshots[id], previewState),
    [data, nodeSnapshots, id, previewState],
  );

  const title = data.nodeName?.trim() || 'Display';
  const badgeClass = resolvedState.sourceKind === 'runtime'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
    : resolvedState.sourceKind === 'preview'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

  const stateClass = resolvedState.status === 'error'
    ? 'border-red-500/60'
    : resolvedState.status === 'running'
      ? 'border-amber-400/60'
      : resolvedState.sourceKind === 'runtime'
        ? 'border-emerald-500/40'
        : resolvedState.sourceKind === 'preview'
          ? 'border-cyan-500/40'
          : 'border-slate-700';

  return (
    <div className="relative flex flex-col items-start group">
      <div className={`relative z-10 w-72 rounded-2xl border bg-[#111827]/95 backdrop-blur-md shadow-xl transition-colors cursor-grab active:cursor-grabbing ${stateClass}`}>
        <div className="absolute left-0 top-5 flex flex-col gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        <div className="absolute right-0 top-5 flex flex-col gap-2 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center shrink-0">
                <Eye size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Observe latest result on canvas</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}>
              {resolvedState.sourceKind === 'empty' ? 'Empty' : resolvedState.sourceKind}
            </span>
            {resolvedState.status === 'running' ? <PlayCircle size={14} className="text-amber-300" /> : null}
            {resolvedState.status === 'error' ? <AlertTriangle size={14} className="text-red-300" /> : null}
            {resolvedState.status === 'success' ? <ActivitySquare size={14} className="text-emerald-300" /> : null}
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
            {resolvedState.schemaText ? <span className="px-2 py-1 rounded-md bg-slate-900 text-slate-300 border border-slate-700">{resolvedState.schemaText}</span> : null}
            {resolvedState.countText ? <span className="px-2 py-1 rounded-md bg-slate-900 text-slate-400 border border-slate-700">{resolvedState.countText}</span> : null}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Summary</div>
            <div className="text-xs text-slate-200 break-words">{resolvedState.summaryText}</div>
          </div>

          {resolvedState.issueText && resolvedState.sourceKind === 'empty' ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200">
              {resolvedState.issueText}
            </div>
          ) : null}

          {resolvedState.metaEntries.length > 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Meta</div>
              {resolvedState.metaEntries.slice(0, 4).map(([key, value]) => (
                <div key={key} className="text-[11px] flex gap-2 text-slate-300">
                  <span className="text-slate-500 shrink-0">{key}</span>
                  <span className="min-w-0 break-all">{formatMetaValue(value, data.truncateAt)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {resolvedState.envelope ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <button
                type="button"
                data-studio-no-drag="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExpanded((previous) => !previous);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-[11px] uppercase tracking-wider text-slate-400 hover:bg-slate-900/50 transition-colors"
              >
                <span>Payload</span>
                <span>{isExpanded ? 'Hide' : 'Show'}</span>
              </button>
              {isExpanded ? (
                <div className="px-3 pb-3 border-t border-slate-800 pt-3 max-h-52 overflow-y-auto">
                  {renderJsonValue(resolvedState.envelope.payload, data.truncateAt)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DisplayNodeCanvas;