import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Copy,
  GitBranchPlus,
  Info,
  Layers3,
  Pencil,
  Plus,
  Power,
  Tags,
  Trash2,
} from 'lucide-react';
import type {
  ClassDescriptor,
  RuntimeQuaternionSnapshot,
  RuntimeSceneComponentSummary,
  RuntimeSceneTransformSnapshot,
  RuntimeSceneTransformUpdate,
  RuntimeVector3Snapshot,
} from '@/domain/analysis/contracts';
import { useAnalysisWorkspace } from '@/domain/analysis/AnalysisWorkspaceContext';
import { useSceneInspectorState, useSceneMutationState } from '../SceneWorkspaceContext';
import { ActionButton, EmptyNotice, ErrorNotice, KeyValue, ObjectLinkCard, SceneCard } from './SceneUiPrimitives';

export function SceneInspectorView() {
  const { analysisSnapshot } = useAnalysisWorkspace();
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
    renameSceneObject,
    setSceneObjectTag,
    setSceneObjectLayer,
    setSceneObjectHideFlags,
    reparentSceneObject,
    setSceneObjectActive,
    setSceneObjectTransform,
    setSceneBehaviourEnabled,
    createSceneComponent,
    deleteSceneComponent,
    sceneMutationState,
  } = useSceneMutationState();

  const [newChildName, setNewChildName] = useState('GameObject');
  const [componentTypeName, setComponentTypeName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [layerDraft, setLayerDraft] = useState('0');
  const [hideFlagsDraft, setHideFlagsDraft] = useState('None');
  const [reparentParentAddressDraft, setReparentParentAddressDraft] = useState('');
  const [transformDraft, setTransformDraft] = useState<RuntimeSceneTransformUpdate | null>(null);

  useEffect(() => {
    setNameDraft(sceneInspector?.object.name ?? '');
    setTagDraft(sceneInspector?.object.tag ?? 'Untagged');
    setLayerDraft(sceneInspector?.object.layer == null ? '0' : String(sceneInspector.object.layer));
    setHideFlagsDraft(sceneInspector?.object.hideFlags ?? 'None');
    setReparentParentAddressDraft(sceneInspector?.parent?.objectAddress ?? '');
    setTransformDraft(toTransformDraft(sceneInspector?.transform));
  }, [
    sceneInspector?.object.name,
    sceneInspector?.object.tag,
    sceneInspector?.object.layer,
    sceneInspector?.object.hideFlags,
    sceneInspector?.parent?.objectAddress,
    sceneInspector?.transform,
  ]);

  const componentTypeOptions = useMemo(() => {
    const classes = Object.values(analysisSnapshot?.classes ?? {});
    const options = classes
      .filter(isLikelyComponentClass)
      .map((descriptor) => descriptor.fullName)
      .sort((left, right) => left.localeCompare(right));

    return Array.from(new Set(options));
  }, [analysisSnapshot?.classes]);

  const transformDirty = useMemo(() => {
    if (!sceneInspector?.transform || !transformDraft) {
      return false;
    }

    return !sameVector(sceneInspector.transform.worldPosition, transformDraft.worldPosition)
      || !sameVector(sceneInspector.transform.localPosition, transformDraft.localPosition)
      || !sameVector(sceneInspector.transform.localEulerAngles, transformDraft.localEulerAngles)
      || !sameVector(sceneInspector.transform.localScale, transformDraft.localScale);
  }, [sceneInspector?.transform, transformDraft]);

  const nameDirty = sceneInspector != null && nameDraft.trim() !== '' && nameDraft !== sceneInspector.object.name;
  const tagDirty = sceneInspector != null && tagDraft !== (sceneInspector.object.tag ?? 'Untagged');
  const hideFlagsDirty = sceneInspector != null && hideFlagsDraft !== (sceneInspector.object.hideFlags ?? 'None');
  const parsedLayer = Number(layerDraft);
  const layerDirty = sceneInspector != null
    && Number.isInteger(parsedLayer)
    && parsedLayer !== (sceneInspector.object.layer ?? 0);
  const reparentDirty = sceneInspector != null && reparentParentAddressDraft !== (sceneInspector.parent?.objectAddress ?? '');

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
          <div className="mt-2 text-sm text-slate-500">
            {sceneInspector?.sceneName ?? 'Unknown Scene'}
            {sceneInspector?.sceneKind ? ` • ${sceneInspector.sceneKind}` : ''}
          </div>
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

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] gap-6">
              <div className="space-y-6">
                <SceneCard title="Object Summary" icon={<Info size={15} />}>
                  <KeyValue label="Address" value={sceneInspector.object.objectAddress} />
                  <KeyValue label="Scene" value={sceneInspector.sceneName ?? 'unknown'} />
                  <KeyValue label="Hierarchy Path" value={formatHierarchyPath(sceneInspector.hierarchyPath)} />
                  <KeyValue label="Active" value={sceneInspector.object.activeSelf ? 'true' : 'false'} />
                  <KeyValue label="Children" value={String(sceneInspector.object.childCount)} />
                  <KeyValue label="Components" value={sceneInspector.object.componentCount == null ? 'n/a' : String(sceneInspector.object.componentCount)} />

                  <InlineEditor
                    label="Name"
                    value={nameDraft}
                    onChange={setNameDraft}
                    actionLabel="Rename"
                    dirty={nameDirty}
                    disabled={sceneMutationState.loading}
                    onSubmit={() => renameSceneObject(nameDraft.trim()).catch(() => undefined)}
                  />

                  <InlineEditor
                    label="Tag"
                    value={tagDraft}
                    onChange={setTagDraft}
                    actionLabel="Apply Tag"
                    dirty={tagDirty}
                    disabled={sceneMutationState.loading}
                    onSubmit={() => setSceneObjectTag(tagDraft).catch(() => undefined)}
                  />

                  <InlineEditor
                    label="Layer"
                    value={layerDraft}
                    onChange={setLayerDraft}
                    actionLabel="Apply Layer"
                    dirty={layerDirty}
                    disabled={sceneMutationState.loading || !Number.isInteger(parsedLayer)}
                    onSubmit={() => setSceneObjectLayer(parsedLayer).catch(() => undefined)}
                  />

                  <InlineEditor
                    label="Hide Flags"
                    value={hideFlagsDraft}
                    onChange={setHideFlagsDraft}
                    actionLabel="Apply Flags"
                    dirty={hideFlagsDirty}
                    disabled={sceneMutationState.loading}
                    onSubmit={() => setSceneObjectHideFlags(hideFlagsDraft).catch(() => undefined)}
                  />

                  <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">Reparent</div>
                    <div className="space-y-3">
                      <input
                        value={reparentParentAddressDraft}
                        onChange={(event) => setReparentParentAddressDraft(event.target.value)}
                        className="w-full rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                        placeholder="Parent object address, or leave empty for root"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                          onClick={() => reparentSceneObject(reparentParentAddressDraft.trim() || null, null).catch(() => undefined)}
                          disabled={sceneMutationState.loading || !reparentDirty}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="inline-flex items-center gap-2"><GitBranchPlus size={14} />Apply Parent</span>
                        </button>
                        <button
                          onClick={() => reparentSceneObject(null, null).catch(() => undefined)}
                          disabled={sceneMutationState.loading || sceneInspector.parent == null}
                          className="rounded-lg border border-[#1c2838] bg-[#0a1018] px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/20 hover:bg-[#0d1520] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Move To Root
                        </button>
                      </div>
                    </div>
                  </div>

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
                      {transformDraft.worldPosition ? (
                        <VectorEditor
                          label="World Position"
                          value={transformDraft.worldPosition}
                          onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, worldPosition: value } : previous)}
                        />
                      ) : null}
                      {transformDraft.localPosition ? (
                        <VectorEditor
                          label="Local Position"
                          value={transformDraft.localPosition}
                          onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localPosition: value } : previous)}
                        />
                      ) : null}
                      {transformDraft.localEulerAngles ? (
                        <VectorEditor
                          label="Local Euler"
                          value={transformDraft.localEulerAngles}
                          onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localEulerAngles: value } : previous)}
                        />
                      ) : null}
                      {transformDraft.localScale ? (
                        <VectorEditor
                          label="Local Scale"
                          value={transformDraft.localScale}
                          onChange={(value) => setTransformDraft((previous) => previous ? { ...previous, localScale: value } : previous)}
                        />
                      ) : null}
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
                      <KeyValue label="Local Rotation (Quaternion)" value={formatQuaternion(sceneInspector.transform?.localRotation)} />
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

                <SceneCard title="Components" icon={<Tags size={15} />}>
                  <div className="rounded-xl border border-[#172231] bg-[#091019] p-3 flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Add Component</label>
                    <div className="flex gap-2">
                      <input
                        list="scene-component-types"
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
                    <datalist id="scene-component-types">
                      {componentTypeOptions.map((typeName) => (
                        <option key={typeName} value={typeName} />
                      ))}
                    </datalist>
                    <div className="text-[11px] text-slate-500">Autocomplete comes from the loaded metadata snapshot. Full type names still work.</div>
                  </div>

                  {sceneInspectorComponentsLoading ? (
                    <div className="text-sm text-cyan-300">
                      Loading components {sceneInspectorTaskState?.componentsLoadedCount ?? 0}/{sceneInspectorTaskState?.componentsTotalCount ?? 0}...
                    </div>
                  ) : null}
                  {!sceneInspectorComponentsLoading && sceneInspector.components.length === 0 ? (
                    <EmptyNotice message="No components returned by runtime." />
                  ) : sceneInspector.components.map((component) => (
                    <ComponentCard
                      key={component.componentAddress}
                      component={component}
                      disabled={sceneMutationState.loading}
                      onToggleBehaviour={(enabled) => setSceneBehaviourEnabled(component.componentAddress, enabled).catch(() => undefined)}
                      onDelete={() => deleteSceneComponent(component.componentAddress).catch(() => undefined)}
                    />
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

function ComponentCard({
  component,
  disabled,
  onToggleBehaviour,
  onDelete,
}: {
  component: RuntimeSceneComponentSummary;
  disabled: boolean;
  onToggleBehaviour: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#1c2838] bg-[#0a1018] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-200 break-all">{component.typeName}</div>
          <div className="text-[11px] text-slate-500 mt-1 break-all">{component.componentAddress}</div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            {component.isBehaviour ? <span>Behaviour</span> : <span>Component</span>}
            {component.isBehaviour && component.behaviourEnabled != null ? <span>{component.behaviourEnabled ? 'enabled' : 'disabled'}</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {component.isBehaviour ? (
            <button
              onClick={() => onToggleBehaviour(!(component.behaviourEnabled ?? false))}
              disabled={disabled}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {component.behaviourEnabled ? 'Disable' : 'Enable'}
            </button>
          ) : null}
          <button
            onClick={onDelete}
            disabled={disabled || component.typeName === 'UnityEngine.Transform'}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineEditor({
  label,
  value,
  onChange,
  actionLabel,
  dirty,
  disabled,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  actionLabel: string;
  dirty: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 mb-3">
        <Pencil size={12} className="text-cyan-300" />
        {label}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
        />
        <button
          onClick={onSubmit}
          disabled={disabled || !dirty}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function toTransformDraft(transform: RuntimeSceneTransformSnapshot | null | undefined): RuntimeSceneTransformUpdate | null {
  if (!transform) {
    return null;
  }

  return {
    worldPosition: transform.worldPosition ? { ...transform.worldPosition } : undefined,
    localPosition: transform.localPosition ? { ...transform.localPosition } : undefined,
    localEulerAngles: transform.localEulerAngles ? { ...transform.localEulerAngles } : undefined,
    localScale: transform.localScale ? { ...transform.localScale } : undefined,
  };
}

function sameVector(left: RuntimeVector3Snapshot | null | undefined, right: RuntimeVector3Snapshot | null | undefined) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function formatQuaternion(value: RuntimeQuaternionSnapshot | null | undefined) {
  if (!value) {
    return 'none';
  }

  return `${value.x.toFixed(3)}, ${value.y.toFixed(3)}, ${value.z.toFixed(3)}, ${value.w.toFixed(3)}`;
}

function formatHierarchyPath(path: Array<{ name: string }>) {
  if (path.length === 0) {
    return 'n/a';
  }

  return path.map((entry) => entry.name).join(' / ');
}

function isLikelyComponentClass(descriptor: ClassDescriptor) {
  if (descriptor.fullName === 'UnityEngine.Transform') {
    return true;
  }

  return descriptor.inheritance.some((entry) => {
    const name = entry.name;
    return name === 'Component' || name === 'Behaviour' || name === 'MonoBehaviour';
  });
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
