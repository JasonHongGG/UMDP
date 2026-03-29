import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Copy,
  Info,
  Layers3,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import type {
  RuntimeQuaternionSnapshot,
  RuntimeSceneTransformSnapshot,
  RuntimeSceneTransformUpdate,
  RuntimeVector3Snapshot,
} from '@/domain/analysis/contracts';
import { useSceneInspectorState, useSceneMutationState } from '../SceneWorkspaceContext';
import { ActionButton, EmptyNotice, ErrorNotice, KeyValue, ObjectLinkCard, SceneCard } from './SceneUiPrimitives';

export function SceneInspectorView() {
  const {
    setSelectedObjectAddress,
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
  } = useSceneInspectorState();
  const {
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    createSceneComponent,
    deleteSceneComponent,
    sceneMutationState,
  } = useSceneMutationState();

  const [newChildName, setNewChildName] = useState('GameObject');
  const [componentTypeName, setComponentTypeName] = useState('');
  const [transformDraft, setTransformDraft] = useState<RuntimeSceneTransformUpdate | null>(null);

  useEffect(() => {
    setTransformDraft(toTransformDraft(sceneInspector?.transform));
  }, [sceneInspector?.object.objectAddress, sceneInspector?.transform]);

  const transformDirty = useMemo(() => {
    if (!sceneInspector?.transform || !transformDraft) {
      return false;
    }

    return !sameVector(sceneInspector.transform.localPosition, transformDraft.localPosition)
      || !sameQuaternion(sceneInspector.transform.localRotation, transformDraft.localRotation)
      || !sameVector(sceneInspector.transform.localScale, transformDraft.localScale);
  }, [sceneInspector?.transform, transformDraft]);

  if (!sceneInspector && !sceneInspectorLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
        <div className="h-16 w-16 rounded-2xl border border-[#1c2838] bg-[#0a0f16] flex items-center justify-center">
          <Layers3 size={28} className="opacity-70" />
        </div>
        <div className="text-lg font-semibold text-slate-300">Scene Inspector</div>
        <div className="max-w-sm text-center text-sm leading-6">Choose a scene object on the left to inspect transform state, children, and attached components.</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto slim-scrollbar px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Inspector</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{sceneInspector?.object.name ?? 'Loading...'}</div>
          <div className="mt-2 text-sm text-slate-500">{sceneInspector?.sceneName ?? 'Unknown Scene'}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {sceneInspectorLoading ? <div className="text-cyan-300">Analyzing...</div> : null}
          {sceneInspectorTaskState ? (
            <div className="mt-1 text-slate-400">
              {sceneInspectorTaskState.childrenLoadedCount}/{sceneInspectorTaskState.childrenTotalCount} children, {sceneInspectorTaskState.componentsLoadedCount}/{sceneInspectorTaskState.componentsTotalCount} components
            </div>
          ) : null}
          {sceneMutationState.loading ? <div className="text-cyan-300 mt-1">Applying {sceneMutationState.operation}...</div> : null}
        </div>
      </div>

      <div className="space-y-6">
        {sceneInspectorError ? <ErrorNotice message={sceneInspectorError} /> : null}
        {sceneMutationState.errorMessage ? <ErrorNotice message={sceneMutationState.errorMessage} /> : null}

        {sceneInspector ? (
          <>
            <SceneCard title="GameObject Actions" icon={<Power size={15} />}>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,1fr)_repeat(3,minmax(0,180px))] gap-3">
                <div className="rounded-xl border border-[#172231] bg-[#091019] p-3 flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Create Empty Child</label>
                  <div className="flex gap-2">
                    <input
                      value={newChildName}
                      onChange={(event) => setNewChildName(event.target.value)}
                      className="flex-1 rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                      placeholder="GameObject"
                    />
                    <button
                      onClick={() => createSceneChild(newChildName.trim() || 'GameObject').catch(() => undefined)}
                      disabled={sceneMutationState.loading}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="inline-flex items-center gap-2"><Plus size={14} />Create</span>
                    </button>
                  </div>
                </div>

                <ActionButton
                  title="Duplicate"
                  icon={<Copy size={15} />}
                  onClick={() => duplicateSceneObject().catch(() => undefined)}
                  disabled={sceneMutationState.loading}
                />

                <ActionButton
                  title={sceneInspector.object.activeSelf ? 'Deactivate' : 'Activate'}
                  icon={<Power size={15} />}
                  onClick={() => setSceneObjectActive(!sceneInspector.object.activeSelf).catch(() => undefined)}
                  disabled={sceneMutationState.loading}
                />

                <ActionButton
                  title="Delete"
                  icon={<Trash2 size={15} />}
                  tone="danger"
                  onClick={() => deleteSceneObject().catch(() => undefined)}
                  disabled={sceneMutationState.loading}
                />
              </div>
            </SceneCard>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-6">
              <div className="space-y-6">
                <SceneCard title="Object Summary" icon={<Info size={15} />}>
                  <KeyValue label="Address" value={sceneInspector.object.objectAddress} />
                  <KeyValue label="Scene" value={sceneInspector.sceneName ?? 'unknown'} />
                  <KeyValue label="Active" value={sceneInspector.object.activeSelf ? 'true' : 'false'} />
                  <KeyValue label="Layer" value={sceneInspector.object.layer == null ? 'n/a' : String(sceneInspector.object.layer)} />
                  <KeyValue label="Tag" value={sceneInspector.object.tag ?? 'untagged'} />
                  <KeyValue label="Children" value={String(sceneInspector.object.childCount)} />
                  <KeyValue label="Components" value={sceneInspector.object.componentCount == null ? 'n/a' : String(sceneInspector.object.componentCount)} />
                  <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">Parent</div>
                    {sceneInspector.parent ? (
                      <button
                        onClick={() => setSelectedObjectAddress(sceneInspector.parent!.objectAddress)}
                        className="w-full rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-left hover:border-cyan-500/30 hover:bg-[#101a26] transition"
                      >
                        <div className="text-sm text-slate-200">{sceneInspector.parent.name}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{sceneInspector.parent.objectAddress}</div>
                      </button>
                    ) : (
                      <div className="text-sm text-slate-500">Root object.</div>
                    )}
                  </div>
                </SceneCard>

                <SceneCard title="Transform" icon={<Box size={15} />}>
                  {transformDraft ? (
                    <div className="space-y-4">
                      <VectorEditor
                        label="Local Position"
                        value={transformDraft.localPosition}
                        onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localPosition: value } : previous)}
                      />
                      <QuaternionEditor
                        label="Local Rotation"
                        value={transformDraft.localRotation}
                        onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localRotation: value } : previous)}
                      />
                      <VectorEditor
                        label="Local Scale"
                        value={transformDraft.localScale}
                        onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localScale: value } : previous)}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                          onClick={() => setSceneObjectTransform(transformDraft).catch(() => undefined)}
                          disabled={!transformDirty || sceneMutationState.loading}
                          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Apply Transform
                        </button>
                        <button
                          onClick={() => setTransformDraft(toTransformDraft(sceneInspector.transform))}
                          disabled={!transformDirty || sceneMutationState.loading}
                          className="rounded-xl border border-[#1c2838] bg-[#0a1018] px-4 py-3 text-sm font-medium text-slate-200 hover:border-cyan-500/20 hover:bg-[#0d1520] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reset Draft
                        </button>
                      </div>
                      <KeyValue label="Transform Address" value={sceneInspector.transform?.transformAddress ?? 'none'} />
                      <KeyValue label="Parent Transform" value={sceneInspector.transform?.parentTransformAddress ?? 'none'} />
                      <KeyValue label="Parent Object" value={sceneInspector.transform?.parentObjectAddress ?? 'none'} />
                    </div>
                  ) : (
                    <EmptyNotice message="Transform is not available for this object." />
                  )}
                </SceneCard>
              </div>

              <div className="space-y-6">
                <SceneCard title="Children" icon={<Layers3 size={15} />}>
                  {sceneInspectorChildrenLoading ? (
                    <div className="text-sm text-cyan-300">
                      Loading children {sceneInspectorTaskState?.childrenLoadedCount ?? 0}/{sceneInspectorTaskState?.childrenTotalCount ?? 0}...
                    </div>
                  ) : null}
                  {!sceneInspectorChildrenLoading && sceneInspector.children.length === 0 ? (
                    <EmptyNotice message="No immediate children." />
                  ) : sceneInspector.children.map((child) => (
                    <ObjectLinkCard
                      key={child.objectAddress}
                      title={child.name}
                      address={child.objectAddress}
                      meta={child.hasChildren ? `${child.childCount} children` : 'leaf'}
                      onClick={() => setSelectedObjectAddress(child.objectAddress)}
                    />
                  ))}
                </SceneCard>

                <SceneCard title="Components" icon={<Layers3 size={15} />}>
                  <div className="rounded-xl border border-[#172231] bg-[#091019] p-3 flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Add Component</label>
                    <div className="flex gap-2">
                      <input
                        value={componentTypeName}
                        onChange={(event) => setComponentTypeName(event.target.value)}
                        className="flex-1 rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                        placeholder="UnityEngine.BoxCollider"
                      />
                      <button
                        onClick={() => createSceneComponent(componentTypeName.trim()).then(() => setComponentTypeName('')).catch(() => undefined)}
                        disabled={sceneMutationState.loading || componentTypeName.trim().length === 0}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="inline-flex items-center gap-2"><Plus size={14} />Add</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500">Use a full type name. Example: UnityEngine.BoxCollider</div>
                  </div>

                  {sceneInspectorComponentsLoading ? (
                    <div className="text-sm text-cyan-300">
                      Loading components {sceneInspectorTaskState?.componentsLoadedCount ?? 0}/{sceneInspectorTaskState?.componentsTotalCount ?? 0}...
                    </div>
                  ) : null}
                  {!sceneInspectorComponentsLoading && sceneInspector.components.length === 0 ? (
                    <EmptyNotice message="No components returned by runtime." />
                  ) : sceneInspector.components.map((component) => (
                    <div
                      key={component.componentAddress}
                      className="rounded-xl border border-[#1c2838] bg-[#0a1018] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-200 break-all">{component.typeName}</div>
                          <div className="text-[11px] text-slate-500 mt-1 break-all">{component.componentAddress}</div>
                        </div>
                        <button
                          onClick={() => deleteSceneComponent(component.componentAddress).catch(() => undefined)}
                          disabled={sceneMutationState.loading || component.typeName === 'UnityEngine.Transform'}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </SceneCard>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function toTransformDraft(transform: RuntimeSceneTransformSnapshot | null | undefined): RuntimeSceneTransformUpdate | null {
  if (!transform?.localPosition || !transform.localRotation || !transform.localScale) {
    return null;
  }

  return {
    localPosition: { ...transform.localPosition },
    localRotation: { ...transform.localRotation },
    localScale: { ...transform.localScale },
  };
}

function sameVector(left: RuntimeVector3Snapshot | null | undefined, right: RuntimeVector3Snapshot | null | undefined) {
  return Boolean(left && right)
    && left!.x === right!.x
    && left!.y === right!.y
    && left!.z === right!.z;
}

function sameQuaternion(left: RuntimeQuaternionSnapshot | null | undefined, right: RuntimeQuaternionSnapshot | null | undefined) {
  return Boolean(left && right)
    && left!.x === right!.x
    && left!.y === right!.y
    && left!.z === right!.z
    && left!.w === right!.w;
}

function VectorEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RuntimeVector3Snapshot;
  onChange: (value: RuntimeVector3Snapshot) => void;
}) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">{label}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <NumberField label="X" value={value.x} onChange={(x) => onChange({ ...value, x })} />
        <NumberField label="Y" value={value.y} onChange={(y) => onChange({ ...value, y })} />
        <NumberField label="Z" value={value.z} onChange={(z) => onChange({ ...value, z })} />
      </div>
    </div>
  );
}

function QuaternionEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RuntimeQuaternionSnapshot;
  onChange: (value: RuntimeQuaternionSnapshot) => void;
}) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">{label}</div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <NumberField label="X" value={value.x} onChange={(x) => onChange({ ...value, x })} />
        <NumberField label="Y" value={value.y} onChange={(y) => onChange({ ...value, y })} />
        <NumberField label="Z" value={value.z} onChange={(z) => onChange({ ...value, z })} />
        <NumberField label="W" value={value.w} onChange={(w) => onChange({ ...value, w })} />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => value.toString());

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  return (
    <label className="rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          const parsed = Number(nextValue);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        className="bg-transparent outline-none"
        inputMode="decimal"
      />
    </label>
  );
}
