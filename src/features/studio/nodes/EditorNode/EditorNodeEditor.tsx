import React, { useMemo, useState } from 'react';
import { AlertCircle, Link2, PlusCircle, Trash2, Wand2 } from 'lucide-react';
import { useStudioExpressionDragState } from '@/features/studio/application/useStudioExpressionDragState';
import { useStudioQueryViewState } from '@/features/studio/application/useStudioQueryViewState';
import {
  createLiteralExpressionSource,
  getExpressionSourceDisplayValue,
  readExpressionDragData,
} from '@/features/studio/core/expression';
import type { INodeEditProps } from '@/features/studio/core/types';
import type { EditorNodeAvailableTarget, EditorNodeQueryState, EditorNodeTargetPreview } from '@/domain/studio/contracts';
import type { EditorNodeData } from './editorNodeModel';
import { createEditorTargetEntry, findEditorTarget } from './editorNodeModel';
import { Select } from '@/shared/ui/Select';

const EDITOR_TARGET_MIME = 'application/x-umdp-editor-target';

function serializeTargetCandidate(candidate: EditorNodeAvailableTarget) {
  return JSON.stringify(candidate);
}

function parseTargetCandidate(raw: string): EditorNodeAvailableTarget | null {
  try {
    const parsed = JSON.parse(raw) as EditorNodeAvailableTarget;
    return parsed?.memberStableId ? parsed : null;
  } catch {
    return null;
  }
}

function statusTone(status: EditorNodeTargetPreview['status']) {
  switch (status) {
    case 'resolved':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'stale':
      return 'border-slate-600 bg-slate-800/70 text-slate-300';
    case 'unsupported':
      return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200';
    case 'missing-instance':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'invalid-value':
    default:
      return 'border-red-500/30 bg-red-500/10 text-red-200';
  }
}

function SourceItem({
  candidate,
  onAdd,
  disabled,
}: {
  candidate: EditorNodeAvailableTarget;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        event.dataTransfer.setData(EDITOR_TARGET_MIME, serializeTargetCandidate(candidate));
        event.dataTransfer.effectAllowed = 'copy';
      }}
      className={`rounded-xl border p-3 transition-colors ${disabled ? 'cursor-not-allowed border-slate-800 bg-slate-950/30 opacity-70' : 'cursor-grab border-slate-700 bg-slate-950/70 hover:border-cyan-500/50'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{candidate.name}</div>
          <div className="text-[11px] text-slate-500">{candidate.typeName}</div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-200 transition-colors hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
        >
          {candidate.supported ? 'Added' : 'Unsupported'}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Address: {candidate.address ?? 'waiting for instance'}</div>
      <div className="mt-1 text-[11px] text-slate-400">Current: {candidate.currentValue === null ? 'null' : String(candidate.currentValue)}</div>
    </div>
  );
}

function TargetLiteralEditor({
  preview,
  rawValue,
  onChange,
}: {
  preview: EditorNodeTargetPreview;
  rawValue: string;
  onChange: (raw: string) => void;
}) {
  if (preview.scalarKind === 'boolean') {
    return (
      <Select
        value={rawValue || 'false'}
        onChange={(val) => onChange(String(val))}
        options={[
          { value: 'false', label: 'false' },
          { value: 'true', label: 'true' }
        ]}
      />
    );
  }

  return (
    <input
      type="text"
      value={rawValue}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
      placeholder={preview.scalarKind === 'address' ? '0x1234' : 'Enter value'}
    />
  );
}

function TargetRow({
  target,
  preview,
  onRemove,
  onUpdateLiteral,
  onBindExpression,
  onResetLiteral,
}: {
  target: EditorNodeData['targets'][number];
  preview: EditorNodeTargetPreview;
  onRemove: () => void;
  onUpdateLiteral: (raw: string) => void;
  onBindExpression: (source: EditorNodeData['targets'][number]['valueSource']) => void;
  onResetLiteral: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useStudioExpressionDragState();
  const literalRaw = target.valueSource.kind === 'literal' ? target.valueSource.raw : '';

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{preview.memberName}</div>
          <div className="text-[11px] text-slate-500">{preview.memberTypeName}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusTone(preview.status)}`}>
            {preview.status.replace('-', ' ')}
          </span>
          <button type="button" onClick={onRemove} className="text-slate-500 transition-colors hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-[11px] text-slate-400 md:grid-cols-3">
        <div>Address: <span className="font-mono text-slate-300">{preview.resolvedAddress ?? 'unresolved'}</span></div>
        <div>Current: <span className="text-slate-300">{preview.currentValue === null ? 'null' : String(preview.currentValue)}</span></div>
        <div>Next: <span className="text-slate-300">{preview.nextValueDisplay || 'not set'}</span></div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className={`rounded-full border px-2 py-0.5 ${preview.valueMode === 'literal' ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200'}`}>
          {preview.valueMode === 'literal' ? 'Literal' : 'Expression'}
        </span>
        {preview.valueMode === 'expression' ? (
          <button type="button" onClick={onResetLiteral} className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300 transition-colors hover:border-cyan-500 hover:text-cyan-200">
            Use literal
          </button>
        ) : null}
      </div>

      {preview.valueMode === 'literal' ? (
        <TargetLiteralEditor preview={preview} rawValue={literalRaw} onChange={onUpdateLiteral} />
      ) : (
        <div className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2.5 text-sm text-fuchsia-100">
          {getExpressionSourceDisplayValue(target.valueSource)}
        </div>
      )}

      <div
        className={`rounded-xl border border-dashed px-3 py-2.5 text-xs transition-colors ${(isDragOver || activeExpressionDrag) ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 text-slate-400'}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          const source = readExpressionDragData(event.dataTransfer);
          if (source) {
            onBindExpression(source as EditorNodeData['targets'][number]['valueSource']);
          }
        }}
        onMouseUpCapture={(event) => {
          if (!activeExpressionDrag) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onBindExpression(activeExpressionDrag.source as EditorNodeData['targets'][number]['valueSource']);
          endExpressionDrag();
        }}
      >
        <div className="flex items-center gap-2">
          <Wand2 size={14} />
          <span>Drop an expression here to bind this target to an upstream value.</span>
        </div>
      </div>

      {preview.issues.length > 0 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100 space-y-1">
          {preview.issues.map((issue) => (
            <div key={issue.code} className="flex items-start gap-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const EditorNodeEditor: React.FC<INodeEditProps<EditorNodeData>> = ({ nodeId, data, updateData }) => {
  const query = useStudioQueryViewState();
  const queryState = useMemo(
    () => query.getNodeQueryState<EditorNodeQueryState>(nodeId) ?? {
      kind: 'missing-edge' as const,
      payload: null,
      availableTargets: [],
      targets: [],
      summary: { totalTargets: data.targets.length, writableTargets: 0, invalidTargets: data.targets.length },
      issues: [{ severity: 'info' as const, code: 'editor.query.missing', message: 'Connect a Class Info input first.' }],
    },
    [data.targets.length, nodeId, query],
  );
  const previewByTargetId = useMemo(
    () => new Map(queryState.targets.map((target) => [target.targetId, target])),
    [queryState.targets],
  );

  const addTarget = (candidate: EditorNodeAvailableTarget) => {
    if (findEditorTarget(data.targets, candidate.memberStableId, candidate.isStatic)) {
      return;
    }

    updateData({
      targets: [...data.targets, createEditorTargetEntry(candidate.memberStableId, candidate.name, candidate.typeName, candidate.isStatic)],
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Link2 size={16} className="text-cyan-300" />
          <span>Available Targets</span>
        </div>
        <div className="text-xs text-slate-500">Drag a member or static field into the editor list to make it writable.</div>

        {queryState.kind !== 'resolved' ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            {queryState.issues[0]?.message ?? 'Connect a Class Info input to inspect writable fields.'}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Members</div>
              {queryState.availableTargets.filter((candidate) => !candidate.isStatic).map((candidate) => (
                <SourceItem
                  key={`${candidate.memberStableId}:member`}
                  candidate={candidate}
                  disabled={!candidate.supported || Boolean(findEditorTarget(data.targets, candidate.memberStableId, candidate.isStatic))}
                  onAdd={() => addTarget(candidate)}
                />
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Statics</div>
              {queryState.availableTargets.filter((candidate) => candidate.isStatic).map((candidate) => (
                <SourceItem
                  key={`${candidate.memberStableId}:static`}
                  candidate={candidate}
                  disabled={!candidate.supported || Boolean(findEditorTarget(data.targets, candidate.memberStableId, candidate.isStatic))}
                  onAdd={() => addTarget(candidate)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(EDITOR_TARGET_MIME)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(event) => {
          const raw = event.dataTransfer.getData(EDITOR_TARGET_MIME);
          const candidate = parseTargetCandidate(raw);
          if (!candidate) {
            return;
          }

          event.preventDefault();
          addTarget(candidate);
        }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <PlusCircle size={16} className="text-cyan-300" />
          <span>Editor Targets</span>
        </div>
        <div className="text-xs text-slate-500">Each row writes a new value to the resolved address for that member.</div>

        {data.targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            Drop a writable member here.
          </div>
        ) : (
          <div className="space-y-4">
            {data.targets.map((target) => {
              const preview = previewByTargetId.get(target.id) ?? {
                targetId: target.id,
                memberStableId: target.memberStableId,
                memberName: target.memberName,
                memberTypeName: target.memberTypeName,
                isStatic: target.isStatic,
                scalarKind: 'unsupported' as const,
                currentValue: null,
                nextValue: null,
                nextValueDisplay: '',
                resolvedAddress: null,
                status: 'stale' as const,
                issues: [{ severity: 'warning' as const, code: 'editor.target.unresolved', message: 'Target preview is not available yet.' }],
                valueMode: target.valueSource.kind === 'literal' ? 'literal' as const : 'expression' as const,
              };

              return (
                <TargetRow
                  key={target.id}
                  target={target}
                  preview={preview}
                  onRemove={() => updateData({ targets: data.targets.filter((candidate) => candidate.id !== target.id) })}
                  onUpdateLiteral={(raw) => updateData({
                    targets: data.targets.map((candidate) => candidate.id === target.id ? {
                      ...candidate,
                      valueSource: createLiteralExpressionSource(
                        raw,
                        preview.scalarKind === 'boolean'
                          ? 'boolean'
                          : preview.scalarKind === 'address'
                            ? 'address'
                            : preview.scalarKind === 'integer' || preview.scalarKind === 'float'
                              ? 'number'
                              : 'string',
                      ),
                    } : candidate),
                  })}
                  onBindExpression={(source) => updateData({
                    targets: data.targets.map((candidate) => candidate.id === target.id ? { ...candidate, valueSource: source } : candidate),
                  })}
                  onResetLiteral={() => updateData({
                    targets: data.targets.map((candidate) => candidate.id === target.id ? {
                      ...candidate,
                      valueSource: createLiteralExpressionSource(
                        preview.scalarKind === 'boolean' ? 'false' : '',
                        preview.scalarKind === 'boolean'
                          ? 'boolean'
                          : preview.scalarKind === 'address'
                            ? 'address'
                            : preview.scalarKind === 'integer' || preview.scalarKind === 'float'
                              ? 'number'
                              : 'string',
                      ),
                    } : candidate),
                  })}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};