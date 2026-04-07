import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Copy,
  Layers3,
  Plus,
  Power,
  Search,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@/shared/ui/Select';
import { Tooltip, TooltipPanel } from '@/shared/ui/Tooltip';
import type {
  ClassDescriptor,
  RuntimeQuaternionSnapshot,
  RuntimeSceneComponentSummary,
  RuntimeSceneNodeSummary,
  RuntimeSceneTransformSnapshot,
  RuntimeSceneTransformUpdate,
  RuntimeVector3Snapshot,
} from '@/domain/analysis/contracts';
import { useAnalysisWorkspace } from '@/app/state/useAnalysisWorkspace';
import { collectLoadedDescendantAddresses, filterLoadedSceneNodeRecords } from '../loadedSceneNodes';
import { useSceneHierarchyGraphState, useSceneInspectorState, useSceneMutationState } from '../SceneWorkspaceContext';
import { EmptyNotice, ErrorNotice } from './SceneUiPrimitives';
import { SceneInspectorTabBar } from './SceneInspectorTabBar';

type TransformVectorKey = 'worldPosition' | 'localPosition' | 'localEulerAngles' | 'localScale';
type TransformAxis = keyof RuntimeVector3Snapshot;

export function SceneInspectorView() {
  const { analysisSnapshot } = useAnalysisWorkspace();
  const { childrenByParent, loadedSceneGraph } = useSceneHierarchyGraphState();
  const {
    setSelectedObjectAddress,
    sceneTabs,
    activeSceneTabIndex,
    handleCloseTab,
    setActiveSceneTabIndex,
    sceneInspector,
    sceneInspectorComponentsPanel,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    sceneInspectorComponentsError,
    sceneObjectComponentsCapability,
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
    isSceneMutationPending,
  } = useSceneMutationState();

  const [newChildName, setNewChildName] = useState('GameObject');
  const [componentTypeName, setComponentTypeName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [layerDraft, setLayerDraft] = useState('0');
  const [hideFlagsDraft, setHideFlagsDraft] = useState('None');
  const [reparentQuery, setReparentQuery] = useState('');
  const [reparentTargetAddress, setReparentTargetAddress] = useState<string | null>(null);
  const [pathCopyState, setPathCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [transformDraft, setTransformDraft] = useState<RuntimeSceneTransformUpdate | null>(null);
  const transformDraftRef = useRef<RuntimeSceneTransformUpdate | null>(null);

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'header': true,
    'transform': true,
    'components': true,
    'children': true,
    'reparent': false,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    setNameDraft(sceneInspector?.object.name ?? '');
    setTagDraft(sceneInspector?.object.tag ?? 'Untagged');
    setLayerDraft(sceneInspector?.object.layer == null ? '0' : String(sceneInspector.object.layer));
    setHideFlagsDraft(sceneInspector?.object.hideFlags ?? 'None');
    setReparentTargetAddress(sceneInspector?.parent?.objectAddress ?? null);
    setReparentQuery('');
    setPathCopyState('idle');
    const nextTransformDraft = toTransformDraft(sceneInspector?.transform);
    transformDraftRef.current = nextTransformDraft;
    setTransformDraft(nextTransformDraft);
  }, [
    sceneInspector?.object.name,
    sceneInspector?.object.tag,
    sceneInspector?.object.layer,
    sceneInspector?.object.hideFlags,
    sceneInspector?.parent?.objectAddress,
    sceneInspector?.transform,
  ]);

  useEffect(() => {
    transformDraftRef.current = transformDraft;
  }, [transformDraft]);

  const componentTypeOptions = useMemo(() => {
    const classes = Object.values(analysisSnapshot?.classes ?? {});
    const options = classes
      .filter(isLikelyComponentClass)
      .map((descriptor) => ({ label: descriptor.fullName, value: descriptor.fullName }))
      .sort((left, right) => left.label.localeCompare(right.label));

    return options;
  }, [analysisSnapshot?.classes]);
  const loadedNodeRecordByAddress = loadedSceneGraph.recordByAddress;
  const blockedReparentAddresses = useMemo(() => {
    if (!sceneInspector) {
      return new Set<string>();
    }

    const blocked = collectLoadedDescendantAddresses(sceneInspector.object.objectAddress, childrenByParent);
    blocked.add(sceneInspector.object.objectAddress);
    return blocked;
  }, [childrenByParent, sceneInspector]);
  const filteredReparentCandidates = useMemo(() => {
    return filterLoadedSceneNodeRecords(loadedSceneGraph, reparentQuery, blockedReparentAddresses);
  }, [blockedReparentAddresses, loadedSceneGraph, reparentQuery]);
  const selectedReparentCandidate = reparentTargetAddress ? loadedNodeRecordByAddress.get(reparentTargetAddress) ?? null : null;
  const copyableHierarchyPath = formatCopyableHierarchyPath(sceneInspector?.object.path, sceneInspector?.hierarchyPath ?? []);

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
  const currentParentAddress = sceneInspector?.parent?.objectAddress ?? null;
  const reparentDirty = sceneInspector != null && reparentTargetAddress !== currentParentAddress;
  const activeIntent = sceneInspector
    ? sceneMutationState.activeIntentByObject[sceneInspector.object.objectAddress] ?? null
    : null;
  const displayedActiveSelf = activeIntent?.desiredActiveSelf ?? (sceneInspector?.object.activeSelf ?? true);
  const activeToggleLabel = activeIntent
    ? activeIntent.status === 'running'
      ? (displayedActiveSelf ? 'Activating…' : 'Deactivating…')
      : (displayedActiveSelf ? 'Queued Activation' : 'Queued Deactivation')
    : (displayedActiveSelf ? 'Active' : 'Inactive');
  const activeTooltipDescription = activeIntent
    ? activeIntent.status === 'running'
      ? (displayedActiveSelf
        ? 'Activation has been committed and is syncing back from the runtime session.'
        : 'Deactivation has been committed and is syncing back from the runtime session.')
      : (displayedActiveSelf
        ? 'Activation is queued behind the current scene mutation.'
        : 'Deactivation is queued behind the current scene mutation.')
    : (displayedActiveSelf
      ? 'This scene object is currently active in the hierarchy.'
      : 'This scene object is currently inactive in the hierarchy.');
  const activeTooltipTone = activeIntent ? 'warning' : displayedActiveSelf ? 'accent' : 'muted';
  const renamePending = isSceneMutationPending('rename');
  const duplicatePending = isSceneMutationPending('duplicate');
  const deletePending = isSceneMutationPending('delete');
  const tagPending = isSceneMutationPending('set-tag');
  const layerPending = isSceneMutationPending('set-layer');
  const transformPending = isSceneMutationPending('set-transform');
  const componentMutationPending = isSceneMutationPending('add-component')
    || isSceneMutationPending('remove-component')
    || isSceneMutationPending('set-behaviour-enabled');
  const createChildPending = isSceneMutationPending('create-child');
  const reparentPending = isSceneMutationPending('reparent');
  const sceneObjectComponentsUnavailable = sceneObjectComponentsCapability.status === 'unsupported';
  const sceneObjectComponentsUnavailableMessage = sceneObjectComponentsUnavailable
    ? sceneObjectComponentsCapability.reason
      ?? 'Scene object component materialization is unavailable for this runtime session.'
    : null;
  const componentPanel = sceneInspectorComponentsPanel;
  const sceneInspectorComponentsMessage = sceneObjectComponentsUnavailableMessage
    ?? componentPanel?.errorMessage
    ?? sceneInspectorComponentsError;
  const visibleComponents = componentPanel?.components ?? sceneInspector?.components ?? [];
  const visibleComponentCount = componentPanel?.totalCount ?? visibleComponents.length;

  const commitTransformDraft = (nextDraft: RuntimeSceneTransformUpdate | null) => {
    const mutationPayload = buildTransformMutationPayload(nextDraft);
    if (!mutationPayload) {
      return;
    }

    setSceneObjectTransform(mutationPayload).catch(() => undefined);
  };

  const updateTransformAxis = (vectorKey: TransformVectorKey, axis: TransformAxis, nextValue: number, commit: boolean) => {
    const current = transformDraftRef.current;
    const currentVector = current?.[vectorKey];
    if (!current || !currentVector) {
      return;
    }

    const nextDraft: RuntimeSceneTransformUpdate = {
      ...current,
      [vectorKey]: {
        ...currentVector,
        [axis]: nextValue,
      },
    };

    transformDraftRef.current = nextDraft;
    setTransformDraft(nextDraft);

    if (commit) {
      commitTransformDraft(nextDraft);
    }
  };

  const applySelectedParent = () => {
    reparentSceneObject(reparentTargetAddress, selectedReparentCandidate?.canonicalPath ?? null).catch(() => undefined);
  };

  const copyHierarchyPath = async () => {
    if (!sceneInspector || copyableHierarchyPath === 'n/a') {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyableHierarchyPath);
      setPathCopyState('copied');
    } catch {
      setPathCopyState('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#070a0f]">
      <SceneInspectorTabBar
        tabs={sceneTabs}
        activeTabIndex={activeSceneTabIndex}
        setActiveTabIndex={setActiveSceneTabIndex}
        handleCloseTab={handleCloseTab}
      />
      
      {!sceneInspector && !sceneInspectorLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
          <div className="h-16 w-16 rounded-2xl border border-[#1c2838] bg-[#0a0f16] flex items-center justify-center">
            <Layers3 size={28} className="opacity-70" />
          </div>
          <div className="text-lg font-semibold text-slate-300">Scene Inspector</div>
          <div className="max-w-sm text-center text-sm leading-6">Choose a scene object on the left to inspect transform state, children, and attached components.</div>
        </div>
      ) : !sceneInspector && sceneInspectorLoading ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col items-center justify-center gap-6"
        >
          <div className="relative flex items-center justify-center">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="w-16 h-16 rounded-full border-[3px] border-[#1c2838] border-t-cyan-500/80 border-r-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm font-semibold text-slate-200">Analyzing Object Data...</div>
          </div>
        </motion.div>
      ) : (
        <div className="flex-1 overflow-y-auto slim-scrollbar bg-[#090e15] text-[#ccc]">
          <motion.div
            key={sceneInspector?.object?.objectAddress ?? 'loading'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="pb-8"
          >
            {/* Top Toolbar */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-2 bg-[#10151c] border-b border-[#1c2838] shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <Tooltip
                  position="bottom"
                  content={(
                    <TooltipPanel
                      label={activeToggleLabel}
                      description={activeTooltipDescription}
                      detail={displayedActiveSelf ? 'Click to deactivate this object.' : 'Click to activate this object.'}
                      tone={activeTooltipTone}
                    />
                  )}
                >
                  <span className="inline-flex">
                    <button
                      type="button"
                      data-testid="scene-object-active-toggle"
                      onClick={() => setSceneObjectActive(!displayedActiveSelf).catch(() => undefined)}
                      aria-label={displayedActiveSelf ? 'Deactivate Scene Object' : 'Activate Scene Object'}
                      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                        displayedActiveSelf
                          ? 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)] hover:bg-cyan-500/18'
                          : 'border-[#223042] bg-[#090e15] text-slate-400 hover:border-slate-500/60 hover:text-white'
                      }`}
                    >
                      <Power size={14} className={displayedActiveSelf ? 'text-cyan-200' : 'text-slate-400'} />
                      {activeIntent ? (
                        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[#10151c] ${
                          activeIntent.status === 'running'
                            ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.7)]'
                            : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.75)]'
                        }`} />
                      ) : null}
                    </button>
                  </span>
                </Tooltip>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => nameDirty && renameSceneObject(nameDraft.trim()).catch(() => undefined)}
                  onKeyDown={(e) => e.key === 'Enter' && nameDirty && renameSceneObject(nameDraft.trim()).catch(() => undefined)}
                  disabled={renamePending}
                  className={`bg-transparent font-semibold text-white px-1 py-0.5 min-w-[150px] outline-none border border-transparent focus:border-cyan-500/50 hover:border-[#1c2838] rounded-sm transition-colors ${nameDirty ? 'text-cyan-300' : ''}`}
                />
                {sceneInspector?.object.isStatic && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-[10px] uppercase font-bold text-slate-400">Static</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Tooltip position="bottom" content={<TooltipPanel label="Duplicate Object" description="Clone the selected scene object under the same parent." tone="default" />}>
                  <span className="inline-flex">
                    <button
                      data-testid="scene-object-duplicate"
                      onClick={() => duplicateSceneObject().catch(() => undefined)}
                      disabled={duplicatePending}
                      aria-label="Duplicate Object"
                      className="p-1.5 rounded hover:bg-[#1a2636] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip position="bottom" content={<TooltipPanel label="Delete Object" description="Remove the selected scene object from the current scene." tone="danger" />}>
                  <span className="inline-flex">
                    <button
                      data-testid="scene-object-delete"
                      onClick={() => deleteSceneObject().catch(() => undefined)}
                      disabled={deletePending}
                      aria-label="Delete Object"
                      className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </Tooltip>
              </div>
            </div>

            {/* Error States */}
            {(sceneInspectorError || sceneMutationState.errorMessage) && (
              <div className="px-3 pt-3">
                {sceneInspectorError && <ErrorNotice message={sceneInspectorError} />}
                {sceneMutationState.errorMessage && <ErrorNotice message={sceneMutationState.errorMessage} />}
              </div>
            )}

            {/* Tags & Layer Bar */}
            <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-2 items-center px-4 py-2 border-b border-[#141b24] text-[11px] bg-[#0c1219]">
              <span className="text-slate-500 font-medium">Tag</span>
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => tagDirty && setSceneObjectTag(tagDraft).catch(() => undefined)}
                onKeyDown={(e) => e.key === 'Enter' && tagDirty && setSceneObjectTag(tagDraft).catch(() => undefined)}
                disabled={tagPending}
                className="bg-[#10151c] border border-[#1a2636] rounded px-2 py-1 text-slate-300 outline-none focus:border-cyan-500/50"
              />
              <span className="text-slate-500 font-medium pl-3">Layer</span>
              <input
                value={layerDraft}
                onChange={(e) => setLayerDraft(e.target.value)}
                onBlur={() => layerDirty && setSceneObjectLayer(parsedLayer).catch(() => undefined)}
                onKeyDown={(e) => e.key === 'Enter' && layerDirty && setSceneObjectLayer(parsedLayer).catch(() => undefined)}
                disabled={layerPending || !Number.isInteger(parsedLayer)}
                className="bg-[#10151c] border border-[#1a2636] rounded px-2 py-1 text-slate-300 outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Transform Accordion */}
            <PropertyAccordion title="Transform" expanded={expandedSections.transform} onToggle={() => toggleSection('transform')}>
              {transformDraft ? (
                <div className="px-2 py-3 flex flex-col gap-2 bg-[#090e15]">
                  {transformDraft.worldPosition ? (
                    <CompactReadonlyVectorRow label="World Pos" value={transformDraft.worldPosition} />
                  ) : null}
                  {transformDraft.localPosition ? (
                    <CompactVectorEditor
                      label="Local Pos"
                      value={transformDraft.localPosition}
                      onAxisChange={(axis, val, commit) => updateTransformAxis('localPosition', axis, val, commit)}
                    />
                  ) : transformDraft.worldPosition ? (
                    <CompactVectorEditor
                      label="World Pos"
                      value={transformDraft.worldPosition}
                      onAxisChange={(axis, val, commit) => updateTransformAxis('worldPosition', axis, val, commit)}
                    />
                  ) : null}
                  {transformDraft.localEulerAngles ? (
                    <CompactVectorEditor
                      label="Local Rot"
                      value={transformDraft.localEulerAngles}
                      onAxisChange={(axis, val, commit) => updateTransformAxis('localEulerAngles', axis, val, commit)}
                    />
                  ) : null}
                  {transformDraft.localScale ? (
                    <CompactVectorEditor
                      label="Local Scale"
                      value={transformDraft.localScale}
                      onAxisChange={(axis, val, commit) => updateTransformAxis('localScale', axis, val, commit)}
                    />
                  ) : null}
                  {transformDirty && (
                    <div className="flex justify-end gap-2 pt-2 mt-1 border-t border-[#141b24]">
                      <button
                        onClick={() => {
                          const nextTransformDraft = toTransformDraft(sceneInspector?.transform);
                          transformDraftRef.current = nextTransformDraft;
                          setTransformDraft(nextTransformDraft);
                        }}
                        className="px-3 py-1.5 rounded bg-[#10151c] hover:bg-[#1a2636] text-[11px] font-medium text-slate-300 transition-colors border border-[#1c2838]"
                      >
                        Revert
                      </button>
                      <button
                        onClick={() => commitTransformDraft(transformDraft)}
                        disabled={transformPending}
                        className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-[11px] font-medium text-cyan-200 transition-colors border border-cyan-500/30"
                      >
                        Apply Changes
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 text-xs text-slate-600 bg-[#090e15]">Transform unavailable</div>
              )}
            </PropertyAccordion>

            {/* Components Accordion */}
            <PropertyAccordion title={`Components (${visibleComponentCount})`} expanded={expandedSections.components} onToggle={() => toggleSection('components')}>
              <div className="bg-[#090e15] px-2 py-2 flex flex-col gap-2">
                <div className="flex gap-2 px-1 pb-1">
                  <div className="flex-1">
                    <Select
                      value={componentTypeName}
                      onChange={(val) => setComponentTypeName(String(val))}
                      options={componentTypeOptions}
                      placeholder="Add Component..."
                    />
                  </div>
                  <button
                    onClick={() => createSceneComponent(componentTypeName).then(() => setComponentTypeName('')).catch(() => undefined)}
                    disabled={sceneObjectComponentsUnavailable || componentMutationPending || !componentTypeName}
                    className="shrink-0 px-3 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30 disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>

                {(componentPanel?.isLoading ?? sceneInspectorComponentsLoading) && (
                  <div className="px-2 py-2 text-[11px] text-cyan-500/70 animate-pulse font-mono flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" /> Fetching components...
                  </div>
                )}

                {sceneInspectorComponentsMessage && (
                  <div className="px-1 pb-1">
                    <ErrorNotice message={sceneInspectorComponentsMessage} />
                  </div>
                )}
                
                {!sceneObjectComponentsUnavailable && sceneInspector && visibleComponents.length > 0 ? (
                  <div className="flex flex-col gap-1 border-t border-[#141b24] pt-2">
                    {visibleComponents.map((component: RuntimeSceneComponentSummary) => (
                      <CompactComponentRow
                        key={component.componentAddress}
                        component={component}
                        disabled={componentMutationPending}
                        onToggleBehaviour={(enabled) => setSceneBehaviourEnabled(component.componentAddress, enabled).catch(() => undefined)}
                        onDelete={() => deleteSceneComponent(component.componentAddress).catch(() => undefined)}
                      />
                    ))}
                  </div>
                ) : !(componentPanel?.isLoading ?? sceneInspectorComponentsLoading) && !sceneInspectorComponentsMessage ? (
                  <div className="border-t border-[#141b24] px-2 pt-3">
                    <EmptyNotice message="No materialized components are currently available for this object." />
                  </div>
                ) : null}
              </div>
            </PropertyAccordion>

            {/* Children Accordion */}
            <PropertyAccordion title={`Children (${sceneInspector?.object.childCount ?? 0})`} expanded={expandedSections.children} onToggle={() => toggleSection('children')}>
              <div className="bg-[#090e15] px-2 py-2">
                <div className="flex gap-2 px-1 pb-2">
                  <input
                    value={newChildName}
                    onChange={(event) => setNewChildName(event.target.value)}
                    className="flex-1 rounded bg-[#10151c] border border-[#1a2636] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                    placeholder="New Child Name"
                  />
                  <button
                    onClick={() => createSceneChild(newChildName.trim() || 'GameObject').catch(() => undefined)}
                    disabled={createChildPending}
                    className="shrink-0 px-3 rounded bg-[#10151c] hover:bg-[#1a2636] text-slate-300 border border-[#1c2838] text-xs transition-colors font-medium flex items-center gap-1"
                  >
                    <Plus size={12} /> Create
                  </button>
                </div>

                {sceneInspectorChildrenLoading && (
                  <div className="px-2 py-2 text-[11px] text-cyan-500/70 animate-pulse font-mono flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" /> Fetching children...
                  </div>
                )}

                <div className="flex flex-col border-t border-[#141b24] pt-1">
                  {sceneInspector?.children.map((child: RuntimeSceneNodeSummary) => (
                    <button
                      key={child.objectAddress}
                      onClick={() => setSelectedObjectAddress(child.objectAddress)}
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#10151c] transition-colors group text-left w-full"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Box size={13} className={`shrink-0 ${child.activeSelf ? 'text-cyan-400/80 group-hover:text-cyan-400' : 'text-slate-600'}`} />
                        <span className={`text-[11px] truncate font-medium ${child.activeSelf ? 'text-slate-300 group-hover:text-white' : 'text-slate-500'}`}>
                          {child.name}
                        </span>
                      </div>
                      {child.hasChildren && (
                        <span className="text-[10px] text-slate-600 bg-[#090e15] px-1.5 rounded border border-[#141b24] shadow-sm">
                          {child.childCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </PropertyAccordion>

            {/* Reparent Accordion */}
            <PropertyAccordion title="Hierarchy Path & Reparenting" expanded={expandedSections.reparent} onToggle={() => toggleSection('reparent')}>
              <div className="bg-[#090e15] px-4 py-3 flex flex-col gap-4 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Current Path</div>
                    <div className="font-mono text-cyan-200/80 bg-[#10151c] p-2 rounded border border-[#1a2636] break-all leading-relaxed shadow-inner">
                      {formatHierarchyPath(sceneInspector?.hierarchyPath ?? [])}
                    </div>
                  </div>
                  <Tooltip
                    position="bottom"
                    content={(
                      <TooltipPanel
                        label={pathCopyState === 'copied' ? 'Path Copied' : pathCopyState === 'error' ? 'Copy Failed' : 'Copy Hierarchy Path'}
                        description={pathCopyState === 'copied'
                          ? 'The current hierarchy path has been copied to the clipboard.'
                          : pathCopyState === 'error'
                            ? 'Clipboard access failed for the current hierarchy path.'
                            : 'Copy the canonical hierarchy path for this object.'}
                        detail={copyableHierarchyPath}
                        tone={pathCopyState === 'copied' ? 'success' : pathCopyState === 'error' ? 'danger' : 'default'}
                      />
                    )}
                  >
                    <span className="inline-flex shrink-0 mt-4">
                      <button
                        data-testid="scene-copy-path"
                        onClick={() => copyHierarchyPath().catch(() => undefined)}
                        className="p-2 rounded bg-[#10151c] hover:bg-[#1a2636] text-slate-400 hover:text-white transition-colors border border-[#1a2636] shadow-sm"
                        aria-label="Copy Hierarchy Path"
                      >
                        <Copy size={14} />
                      </button>
                    </span>
                  </Tooltip>
                </div>
                
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Reparent To</div>
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-slate-500 shrink-0" />
                    <input
                      value={reparentQuery}
                      onChange={(e) => setReparentQuery(e.target.value)}
                      placeholder="Search node..."
                      className="flex-1 bg-[#10151c] border border-[#1a2636] rounded px-2 py-1.5 focus:border-cyan-500/50 outline-none text-slate-200"
                    />
                  </div>
                  <Select 
                    value={reparentTargetAddress ?? 'ROOT'}
                    onChange={(val) => setReparentTargetAddress(val === 'ROOT' ? null : String(val))}
                    options={[
                      { label: '-- Scene Root --', value: 'ROOT' },
                      ...filteredReparentCandidates.map((c) => ({
                        label: `${c.node.name} (${c.displayPath})`,
                        value: c.node.objectAddress,
                      }))
                    ]}
                  />
                  {reparentDirty && (
                    <button
                      onClick={applySelectedParent}
                      disabled={reparentPending}
                      className="w-full mt-2 py-1.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-[11px] font-bold hover:bg-cyan-500/30 transition-colors"
                    >
                      Apply Parent Changes
                    </button>
                  )}
                </div>
              </div>
            </PropertyAccordion>

          </motion.div>
        </div>
      )}
    </div>
  );
}

// ------------- COMPACT PRMITIVES -------------

function PropertyAccordion({ title, expanded, onToggle, children }: { title: string, expanded: boolean, onToggle: () => void, children: React.ReactNode }) {
  return (
    <div className="border-b border-[#141b24]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[#0d131a] hover:bg-[#101822] transition-colors group outline-none"
      >
        <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase select-none group-hover:text-white transition-colors">{title}</span>
        {expanded ? <ChevronDown size={14} className="text-slate-500 group-hover:text-white transition-colors" /> : <ChevronRight size={14} className="text-slate-600 group-hover:text-white transition-colors" />}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden bg-[#090e15]"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompactVectorEditor({ label, value, onAxisChange }: { label: string, value: RuntimeVector3Snapshot, onAxisChange: (axis: TransformAxis, val: number, commit: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 pl-2 pr-1">
      <div className="w-[92px] shrink-0 text-[11px] font-medium text-slate-400">{label}</div>
      <div className="flex-1 flex items-center gap-1 overflow-hidden">
        <CompactNumberInput tone="x" value={value.x} onChange={(v: number) => onAxisChange('x', v, false)} onDragCommit={(v: number) => onAxisChange('x', v, true)} />
        <CompactNumberInput tone="y" value={value.y} onChange={(v: number) => onAxisChange('y', v, false)} onDragCommit={(v: number) => onAxisChange('y', v, true)} />
        <CompactNumberInput tone="z" value={value.z} onChange={(v: number) => onAxisChange('z', v, false)} onDragCommit={(v: number) => onAxisChange('z', v, true)} />
      </div>
    </div>
  );
}

function CompactReadonlyVectorRow({ label, value }: { label: string; value: RuntimeVector3Snapshot }) {
  return (
    <div className="flex items-center gap-2 pl-2 pr-1">
      <div className="w-[92px] shrink-0 text-[11px] font-medium text-slate-400">{label}</div>
      <div className="flex-1 flex items-center gap-1 overflow-hidden">
        <CompactReadonlyNumber tone="x" value={value.x} />
        <CompactReadonlyNumber tone="y" value={value.y} />
        <CompactReadonlyNumber tone="z" value={value.z} />
      </div>
    </div>
  );
}

function CompactReadonlyNumber({ tone, value }: { tone: 'x' | 'y' | 'z'; value: number }) {
  const prefix = tone.toUpperCase();

  return (
    <div className="flex-1 flex overflow-hidden rounded bg-[#0d131a] border border-[#1a2636] shadow-inner">
      <div className={`px-1.5 flex items-center justify-center text-[9px] font-bold border-r ${resolveAxisToneClass(tone)}`}>
        {prefix}
      </div>
      <div className="w-full min-w-0 px-1.5 py-1 text-[11px] font-mono text-slate-400">
        {formatNumericDraft(value)}
      </div>
    </div>
  );
}

function CompactNumberInput({
  tone,
  value,
  onChange,
  onDragCommit,
  step = 0.1,
}: {
  tone: 'x' | 'y' | 'z';
  value: number;
  onChange: (value: number) => void;
  onDragCommit?: (value: number) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState(() => formatNumericDraft(value));
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => setDraft(formatNumericDraft(value)), [value]);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  const labelColorClass = resolveAxisToneClass(tone);
  const prefix = tone.toUpperCase();

  const startDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragCleanupRef.current?.();

    let lastValue = value;
    const startX = event.clientX;
    let changed = false;

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - startX;
      const nextValue = roundToStep(value + (deltaX / 5) * step, step);
      if (nextValue !== lastValue) {
        changed = true;
        lastValue = nextValue;
        setDraft(formatNumericDraft(nextValue));
        onChange(nextValue);
      }
    };

    const finishDrag = () => {
      dragCleanupRef.current?.();
      document.body.style.removeProperty('cursor');
      if (changed) onDragCommit?.(lastValue);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finishDrag, { once: true });
    document.body.style.cursor = 'ew-resize';

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishDrag);
    };
  };

  return (
    <div className="flex-1 flex overflow-hidden rounded bg-[#10151c] border border-[#1a2636] focus-within:border-cyan-500/50 shadow-inner group">
      <div 
        onPointerDown={startDrag} 
        className={`px-1.5 flex items-center justify-center text-[9px] font-bold cursor-ew-resize border-r ${labelColorClass}`}
      >
        {prefix}
      </div>
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => onDragCommit?.(value)}
        onKeyDown={(e) => e.key === 'Enter' && onDragCommit?.(value)}
        className="w-full min-w-0 bg-transparent text-[11px] text-slate-200 font-mono px-1.5 py-1 outline-none"
      />
    </div>
  );
}

function CompactComponentRow({
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
  const isBehaviour = component.isBehaviour;
  const isEnabled = component.behaviourEnabled !== false;
  const canDelete = component.typeName !== 'UnityEngine.Transform';
  const componentTooltipDescription = isBehaviour
    ? isEnabled
      ? 'Behaviour component · enabled.'
      : 'Behaviour component · disabled.'
    : 'Read-only component.';
  const componentTooltipDetail = isBehaviour
    ? disabled
      ? 'A scene mutation is already running for this object.'
      : isEnabled
        ? 'Click to disable this behaviour.'
        : 'Click to enable this behaviour.'
    : 'This component does not expose an enabled state.';
  const componentTooltipTone = isBehaviour ? (isEnabled ? 'accent' : 'warning') : 'muted';

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-2.5 py-2 transition-colors ${
      isEnabled ? 'border-[#182230] bg-[#0d131a] hover:border-[#223042]' : 'border-[#1a2230] bg-[#0b1018]'
    }`}>
      <Tooltip
        position="bottom"
        content={(
          <TooltipPanel
            label={component.typeName}
            description={componentTooltipDescription}
            detail={componentTooltipDetail}
            tone={componentTooltipTone}
          />
        )}
      >
        <span className="inline-flex shrink-0">
          {isBehaviour ? (
            <button
              type="button"
              data-testid={`scene-component-toggle-${component.componentAddress}`}
              onClick={() => onToggleBehaviour(!isEnabled)}
              disabled={disabled}
              aria-label={isEnabled ? `Disable ${component.typeName}` : `Enable ${component.typeName}`}
              aria-pressed={isEnabled}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                isEnabled
                  ? 'border-cyan-500/40 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/22'
                  : 'border-[#28364a] bg-[#10151c] text-slate-300 hover:border-slate-500/60 hover:text-white'
              }`}
            >
              {isEnabled ? <Check size={12} strokeWidth={2.4} /> : <Power size={12} strokeWidth={2.1} />}
            </button>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#28364a] bg-[#111822] text-slate-400">
              <Box size={12} />
            </span>
          )}
        </span>
      </Tooltip>
      <Tooltip
        position="bottom"
        content={(
          <TooltipPanel
            label={component.typeName}
            description={componentTooltipDescription}
            detail={componentTooltipDetail}
            tone={componentTooltipTone}
          />
        )}
      >
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-bold truncate ${isEnabled ? 'text-slate-200' : 'text-slate-400'} select-all`}>
            {component.typeName}
          </span>
        </div>
      </Tooltip>
      <Tooltip
        position="bottom"
        content={(
          <TooltipPanel
            label={canDelete ? `Remove ${component.typeName}` : 'Transform Component'}
            description={canDelete
              ? 'Remove this component from the selected scene object.'
              : 'UnityEngine.Transform is required and cannot be removed.'}
            tone={canDelete ? 'danger' : 'muted'}
          />
        )}
      >
        <span className="inline-flex shrink-0">
          <button
            data-testid={`scene-component-remove-${component.componentAddress}`}
            onClick={onDelete}
            disabled={disabled || !canDelete}
            aria-label={canDelete ? `Remove ${component.typeName}` : `${component.typeName} cannot be removed`}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
          >
            <X size={12} />
          </button>
        </span>
      </Tooltip>
    </div>
  );
}

function buildTransformMutationPayload(transform: RuntimeSceneTransformUpdate | null): RuntimeSceneTransformUpdate | null {
  if (!transform) {
    return null;
  }

  const hasLocalPosition = transform.localPosition != null;

  return {
    worldPosition: hasLocalPosition ? undefined : transform.worldPosition,
    localPosition: transform.localPosition,
    localRotation: transform.localRotation,
    localEulerAngles: transform.localEulerAngles,
    localScale: transform.localScale,
  };
}

function toTransformDraft(transform: RuntimeSceneTransformSnapshot | null | undefined): RuntimeSceneTransformUpdate | null {
  if (!transform) return null;
  return {
    worldPosition: transform.worldPosition ? { ...transform.worldPosition } : undefined,
    localPosition: transform.localPosition ? { ...transform.localPosition } : undefined,
    localEulerAngles: transform.localEulerAngles ? { ...transform.localEulerAngles } : undefined,
    localScale: transform.localScale ? { ...transform.localScale } : undefined,
  };
}

function sameVector(left: RuntimeVector3Snapshot | null | undefined, right: RuntimeVector3Snapshot | null | undefined) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) < 0.0001 && Math.abs(left.y - right.y) < 0.0001 && Math.abs(left.z - right.z) < 0.0001;
}

function formatHierarchyPath(path: Array<{ name: string }>) {
  if (path.length === 0) return 'n/a';
  return path.map((entry) => entry.name).join(' / ');
}

function formatCopyableHierarchyPath(canonicalPath: string | null | undefined, path: Array<{ name: string }>) {
  if (canonicalPath) return canonicalPath;
  if (path.length === 0) return 'n/a';
  return path.map((entry) => entry.name).join('/');
}

function isLikelyComponentClass(descriptor: ClassDescriptor) {
  if (descriptor.fullName === 'UnityEngine.Transform') return true;
  return descriptor.inheritance.some((entry) => ['Component', 'Behaviour', 'MonoBehaviour'].includes(entry.name));
}

function formatNumericDraft(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function resolveAxisToneClass(tone: 'x' | 'y' | 'z') {
  return tone === 'x'
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    : tone === 'y'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : 'bg-blue-500/20 text-blue-300 border-blue-500/30';
}

function roundToStep(value: number, step: number) {
  const scale = 1 / step;
  return Math.round(value * scale) / scale;
}
