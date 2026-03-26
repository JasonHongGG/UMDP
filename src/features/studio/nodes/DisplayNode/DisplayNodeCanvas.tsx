import React, { useMemo } from 'react';
import { ActivitySquare, AlertTriangle, Eye, PlayCircle } from 'lucide-react';
import { useStudioQueryViewState } from '@/features/studio/application/useStudioQueryViewState';
import { useStudioRuntimeViewState } from '@/features/studio/application/useStudioRuntimeViewState';
import { Port } from '@/features/studio/components/canvas/Port';
import type { INodeComponentProps } from '@/features/studio/core/types';
import type { DisplayNodeQueryState, DisplayNodeResolvedField, NodeExecutionSnapshot, WorkflowJsonEnvelope, WorkflowJsonValue } from '@/domain/studio/contracts';
import {
  resolveDisplaySelectedFields,
  type DisplayNodeData,
} from './displayNodeModel';

interface ResolvedDisplayState {
  sourceKind: 'runtime' | 'preview' | 'empty';
  status: 'idle' | 'running' | 'success' | 'error' | 'aborted';
  envelope: WorkflowJsonEnvelope | null;
  observedPayload: WorkflowJsonValue | null;
  selectedFields: DisplayNodeResolvedField[];
  issueText: string | null;
}

function getRuntimeEnvelope(snapshot: NodeExecutionSnapshot | undefined) {
  return snapshot?.inputs['payload-in']?.[0] ?? null;
}

function getObservedRuntimePayload(snapshot: NodeExecutionSnapshot | undefined): WorkflowJsonValue | null {
  const observedPayload = snapshot?.nextRuntimeState?.observedPayload;
  if (observedPayload !== undefined) {
    return observedPayload as WorkflowJsonValue | null;
  }

  return getRuntimeEnvelope(snapshot)?.payload ?? null;
}

function buildResolvedState(
  data: DisplayNodeData,
  snapshot: NodeExecutionSnapshot | undefined,
  previewState: DisplayNodeQueryState | null,
): ResolvedDisplayState {
  const runtimeEnvelope = getRuntimeEnvelope(snapshot);
  const runtimePayload = getObservedRuntimePayload(snapshot);
  if (snapshot && runtimePayload !== null) {
    return {
      sourceKind: 'runtime',
      status: snapshot.status,
      envelope: runtimeEnvelope,
      observedPayload: runtimePayload,
      selectedFields: resolveDisplaySelectedFields(data.selectedFields ?? [], runtimePayload),
      issueText: snapshot.errorMessage ?? snapshot.issues?.[0]?.message ?? null,
    };
  }

  if (snapshot?.status === 'running') {
    return {
      sourceKind: 'runtime',
      status: 'running',
      envelope: null,
      observedPayload: null,
      selectedFields: [],
      issueText: null,
    };
  }

  if (previewState?.kind === 'resolved') {
    return {
      sourceKind: 'preview',
      status: 'success',
      envelope: previewState.envelope,
      observedPayload: previewState.envelope.payload,
      selectedFields: previewState.selectedFields,
      issueText: null,
    };
  }

  return {
    sourceKind: 'empty',
    status: snapshot?.status ?? 'idle',
    envelope: null,
    observedPayload: null,
    selectedFields: [],
    issueText: previewState?.issues[0]?.message ?? null,
  };
}

export const DisplayNodeCanvas: React.FC<INodeComponentProps<DisplayNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeSnapshots } = useStudioRuntimeViewState();
  const query = useStudioQueryViewState();

  const previewState = query.getNodeQueryState<DisplayNodeQueryState>(id);
  const resolvedState = useMemo(
    () => buildResolvedState(data, nodeSnapshots[id], previewState),
    [data, nodeSnapshots, id, previewState],
  );

  const title = data.nodeName?.trim() || 'Display';
  const hasSelectedFields = resolvedState.selectedFields.length > 0;
  const badgeClass = resolvedState.sourceKind === 'runtime'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
    : resolvedState.sourceKind === 'preview'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

  const stateClass = resolvedState.status === 'error'
    ? 'border-red-500/60'
    : resolvedState.status === 'aborted'
      ? 'border-amber-400/60'
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
            {resolvedState.status === 'aborted' ? <AlertTriangle size={14} className="text-amber-300" /> : null}
            {resolvedState.status === 'error' ? <AlertTriangle size={14} className="text-red-300" /> : null}
            {resolvedState.status === 'success' ? <ActivitySquare size={14} className="text-emerald-300" /> : null}
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {resolvedState.issueText && resolvedState.sourceKind === 'empty' ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200">
              {resolvedState.issueText}
            </div>
          ) : null}

          {resolvedState.observedPayload !== null && hasSelectedFields ? (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Selected Fields</div>
              {resolvedState.selectedFields.map((field) => (
                <div key={field.id} className={`rounded-xl border p-3 ${field.resolved ? 'border-slate-800 bg-slate-950/50' : 'border-amber-500/20 bg-amber-500/5'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">{field.label}</div>
                      <div className="mt-1 text-[11px] text-slate-500 break-all">{field.pathText}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${field.resolved ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>
                      {field.valueKind}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-slate-200 break-words">
                    {field.displayText}
                  </div>
                  {field.issue ? (
                    <div className="mt-2 text-[11px] text-amber-200">{field.issue.message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {resolvedState.observedPayload !== null && !hasSelectedFields ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-3 text-[11px] text-slate-400">
              Select payload fields in the Display node editor to pin the values you care about here.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DisplayNodeCanvas;