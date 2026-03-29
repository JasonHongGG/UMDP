import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Layers3,
  Map,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { RuntimeSceneNodeSummary } from '@/domain/analysis/contracts';
import { useAnalysisRepository } from '@/domain/analysis/hooks/useAnalysisRepository';
import { useWorkspaceShellState } from '@/domain/analysis/AnalysisWorkspaceContext';
import { useSceneWorkspaceState } from './useSceneWorkspaceState';

export function ScenePage() {
  const repository = useAnalysisRepository();
  const { workspaceLifecycle, activePage } = useWorkspaceShellState();
  const {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    childrenByParent,
    loadingChildrenByParent,
    childErrorByParent,
    ensureSceneObjectChildrenLoaded,
    sceneInspector,
    sceneInspectorTaskState,
    sceneInspectorLoading,
    sceneInspectorChildrenLoading,
    sceneInspectorComponentsLoading,
    sceneInspectorError,
    createSceneChild,
    duplicateSceneObject,
    deleteSceneObject,
    setSceneObjectActive,
    sceneMutationState,
  } = useSceneWorkspaceState({
    repository,
    workspaceLifecycle,
    active: activePage === 'scene',
  });

  const [expandedSceneHandles, setExpandedSceneHandles] = useState<Record<number, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [newChildName, setNewChildName] = useState('GameObject');

  const detached = !workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot;
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];

  const toggleScene = (sceneHandle: number) => {
    setExpandedSceneHandles((previous) => ({
      ...previous,
      [sceneHandle]: !previous[sceneHandle],
    }));
  };

  const toggleNode = (node: RuntimeSceneNodeSummary) => {
    if (!node.hasChildren && !childrenByParent[node.objectAddress]?.length) {
      return;
    }

    setExpandedNodes((previous) => {
      const nextExpanded = !previous[node.objectAddress];
      if (nextExpanded && node.hasChildren) {
        ensureSceneObjectChildrenLoaded(node.objectAddress).catch(() => undefined);
      }

      return {
        ...previous,
        [node.objectAddress]: nextExpanded,
      };
    });
  };

  const summary = useMemo(() => {
    const sceneCount = scenes.length;
    const rootCount = scenes.reduce((count, scene) => count + scene.roots.length, 0);
    return { sceneCount, rootCount };
  }, [scenes]);

  if (detached) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400">
        Attach to a Unity process and load metadata before opening the Scene workspace.
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#081019]">
      <div className="w-[400px] shrink-0 border-r border-[#1c2838] bg-[#05080c]/95 flex flex-col">
        <div className="px-4 py-4 border-b border-[#1c2838] flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Scene Runtime</div>
            <div className="mt-1 text-slate-200 font-semibold">Loaded Objects</div>
            <div className="mt-1 text-xs text-slate-500">{summary.sceneCount} scenes, {summary.rootCount} root objects</div>
          </div>
          <button
            onClick={() => refreshSceneWorkspace().catch(() => undefined)}
            className="h-10 w-10 rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition"
            title="Refresh scene workspace"
          >
            <RefreshCw size={16} className={sceneWorkspace.refreshStatus === 'refreshing' ? 'animate-spin' : ''} />
          </button>
        </div>

        {sceneWorkspace.errorMessage ? (
          <div className="mx-4 mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
            {sceneWorkspace.errorMessage}
          </div>
        ) : null}

        {sceneWorkspace.refreshStatus === 'refreshing' && !sceneWorkspace.snapshot ? (
          <div className="px-4 py-3 text-sm text-slate-400">Refreshing scene catalog...</div>
        ) : null}

        {!sceneWorkspace.snapshot && sceneWorkspace.refreshStatus === 'idle' ? (
          <div className="px-4 py-3 text-sm text-slate-400">No scene snapshot yet. Click refresh to enumerate loaded scenes.</div>
        ) : null}

        <div className="flex-1 overflow-y-auto slim-scrollbar px-2 py-3">
          {scenes.map((scene) => {
            const sceneExpanded = expandedSceneHandles[scene.sceneHandle] ?? true;

            return (
              <div key={scene.sceneHandle} className="mb-3 rounded-2xl border border-[#142132] bg-[#0a0f16]/80 overflow-hidden">
                <button
                  onClick={() => toggleScene(scene.sceneHandle)}
                  className="w-full px-3 py-3 flex items-center gap-2 text-left text-sm text-slate-200 hover:bg-white/5 transition"
                >
                  {sceneExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Map size={15} className="text-cyan-300" />
                  <span className="font-medium truncate">{scene.name}</span>
                  <span className="ml-auto text-[11px] text-slate-500">{scene.roots.length} roots</span>
                </button>

                {sceneExpanded ? (
                  <div className="pb-2">
                    {scene.roots.map((node) => (
                      <SceneNodeRow
                        key={node.objectAddress}
                        node={node}
                        depth={0}
                        selectedObjectAddress={selectedObjectAddress}
                        onSelect={setSelectedObjectAddress}
                        expandedNodes={expandedNodes}
                        onToggle={toggleNode}
                        childrenByParent={childrenByParent}
                        loadingChildrenByParent={loadingChildrenByParent}
                        childErrorByParent={childErrorByParent}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#09121c_0%,#0a0f16_55%,#071019_100%)]">
        {!sceneInspector && !sceneInspectorLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
            <div className="h-16 w-16 rounded-2xl border border-[#1c2838] bg-[#0a0f16] flex items-center justify-center">
              <Layers3 size={28} className="opacity-70" />
            </div>
            <div className="text-lg font-semibold text-slate-300">Scene Inspector</div>
            <div className="max-w-sm text-center text-sm leading-6">Choose a scene object on the left to inspect transform state, children, and attached components.</div>
          </div>
        ) : (
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

            {sceneInspectorError ? (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
                {sceneInspectorError}
              </div>
            ) : null}

            {sceneMutationState.errorMessage ? (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
                {sceneMutationState.errorMessage}
              </div>
            ) : null}

            {sceneInspector ? (
              <div className="space-y-6">
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
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Read Only</div>
                      <VectorBlock label="Local Position" value={sceneInspector.transform?.localPosition} />
                      <VectorBlock label="Local Rotation" value={sceneInspector.transform?.localRotation} />
                      <VectorBlock label="Local Scale" value={sceneInspector.transform?.localScale} />
                      <KeyValue label="Transform Address" value={sceneInspector.transform?.transformAddress ?? 'none'} />
                      <KeyValue label="Parent Transform" value={sceneInspector.transform?.parentTransformAddress ?? 'none'} />
                      <KeyValue label="Parent Object" value={sceneInspector.transform?.parentObjectAddress ?? 'none'} />
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
                        <div className="text-sm text-slate-500">No immediate children.</div>
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
                      {sceneInspectorComponentsLoading ? (
                        <div className="text-sm text-cyan-300">
                          Loading components {sceneInspectorTaskState?.componentsLoadedCount ?? 0}/{sceneInspectorTaskState?.componentsTotalCount ?? 0}...
                        </div>
                      ) : null}
                      {!sceneInspectorComponentsLoading && sceneInspector.components.length === 0 ? (
                        <div className="text-sm text-slate-500">No components returned by runtime.</div>
                      ) : sceneInspector.components.map((component) => (
                        <div
                          key={component.componentAddress}
                          className="rounded-xl border border-[#1c2838] bg-[#0a1018] px-3 py-3"
                        >
                          <div className="text-sm text-slate-200 break-all">{component.typeName}</div>
                          <div className="text-[11px] text-slate-500 mt-1 break-all">{component.componentAddress}</div>
                        </div>
                      ))}
                    </SceneCard>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  title,
  icon,
  onClick,
  disabled,
  tone = 'default',
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${tone === 'danger'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
        : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
        }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
    </button>
  );
}

function ObjectLinkCard({
  title,
  address,
  meta,
  onClick,
}: {
  title: string;
  address: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-[#1c2838] bg-[#0a1018] px-3 py-3 text-left hover:border-cyan-500/30 hover:bg-[#0d1520] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-200 truncate">{title}</div>
          <div className="text-[11px] text-slate-500 mt-1 break-all">{address}</div>
        </div>
        {meta ? <div className="text-[11px] text-slate-500 shrink-0">{meta}</div> : null}
      </div>
    </button>
  );
}

function SceneCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#1b2737] bg-[#0b1119]/90 shadow-[0_20px_40px_rgba(0,0,0,0.25)] px-5 py-5">
      <div className="flex items-center gap-2 text-sm text-slate-200 font-medium mb-4">
        <span className="text-cyan-300">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3 flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 break-all text-right">{value}</span>
    </div>
  );
}

function VectorBlock({ label, value }: { label: string; value: { x: number; y: number; z: number; w?: number } | null | undefined }) {
  return (
    <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">{label}</div>
      {value ? (
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-200">
          <span>X: {value.x.toFixed(3)}</span>
          <span>Y: {value.y.toFixed(3)}</span>
          <span>Z: {value.z.toFixed(3)}</span>
          {'w' in value && typeof value.w === 'number' ? <span>W: {value.w.toFixed(3)}</span> : <span />}
        </div>
      ) : (
        <div className="text-sm text-slate-500">Not available.</div>
      )}
    </div>
  );
}

function SceneNodeRow({
  node,
  depth,
  selectedObjectAddress,
  onSelect,
  expandedNodes,
  onToggle,
  childrenByParent,
  loadingChildrenByParent,
  childErrorByParent,
}: {
  node: RuntimeSceneNodeSummary;
  depth: number;
  selectedObjectAddress: string | null;
  onSelect: (objectAddress: string) => void;
  expandedNodes: Record<string, boolean>;
  onToggle: (node: RuntimeSceneNodeSummary) => void;
  childrenByParent: Record<string, RuntimeSceneNodeSummary[]>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
}) {
  const children = childrenByParent[node.objectAddress] ?? [];
  const loading = loadingChildrenByParent[node.objectAddress];
  const childError = childErrorByParent[node.objectAddress];
  const hasLoadedChildren = Object.prototype.hasOwnProperty.call(childrenByParent, node.objectAddress);
  const expanded = expandedNodes[node.objectAddress] ?? false;
  const canExpand = node.hasChildren || children.length > 0;

  return (
    <div>
      <div className={`mx-2 mt-1 rounded-xl border ${selectedObjectAddress === node.objectAddress ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-transparent hover:border-[#1c2838] hover:bg-white/5'} transition`}>
        <div className="flex items-center gap-1 px-2 py-2" style={{ paddingLeft: `${12 + depth * 18}px` }}>
          <button
            onClick={() => onToggle(node)}
            disabled={!canExpand}
            className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${canExpand ? 'text-slate-400 hover:text-slate-200' : 'text-slate-700 cursor-default'}`}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <button onClick={() => onSelect(node.objectAddress)} className="min-w-0 flex-1 text-left">
            <div className="text-sm text-slate-200 truncate">{node.name}</div>
          </button>
          {node.hasChildren || hasLoadedChildren ? <span className="text-[11px] text-slate-500 shrink-0">{node.childCount}</span> : null}
        </div>
      </div>

      {expanded ? (
        <div>
          {loading ? <div className="ml-10 px-4 py-1 text-xs text-cyan-300">Loading children...</div> : null}
          {childError ? <div className="ml-10 px-4 py-1 text-xs text-rose-300">{childError}</div> : null}
          {children.map((child) => (
            <SceneNodeRow
              key={child.objectAddress}
              node={child}
              depth={depth + 1}
              selectedObjectAddress={selectedObjectAddress}
              onSelect={onSelect}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              childrenByParent={childrenByParent}
              loadingChildrenByParent={loadingChildrenByParent}
              childErrorByParent={childErrorByParent}
            />
          ))}
          {!loading && !childError && hasLoadedChildren && children.length === 0 ? (
            <div className="ml-10 px-4 py-1 text-xs text-slate-500">No children.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}