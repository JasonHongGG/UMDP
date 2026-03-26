import { useMemo, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Info,
  Layers3,
  Map,
  RefreshCw,
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
    sceneInspectorLoading,
    sceneInspectorError,
  } = useSceneWorkspaceState({
    repository,
    workspaceLifecycle,
    active: activePage === 'scene',
  });

  const [expandedSceneHandles, setExpandedSceneHandles] = useState<Record<number, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const detached = !workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot;
  const scenes = sceneWorkspace.snapshot?.scenes ?? [];

  const toggleScene = (sceneHandle: number) => {
    setExpandedSceneHandles((previous) => ({
      ...previous,
      [sceneHandle]: !previous[sceneHandle],
    }));
  };

  const toggleNode = (node: RuntimeSceneNodeSummary) => {
    if (!node.hasChildren) {
      return;
    }

    setExpandedNodes((previous) => {
      const nextExpanded = !previous[node.objectAddress];
      if (nextExpanded) {
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
      <div className="w-[380px] shrink-0 border-r border-[#1c2838] bg-[#05080c]/95 flex flex-col">
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
                  <span className="font-medium">{scene.name}</span>
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
              {sceneInspectorLoading ? (
                <div className="text-sm text-cyan-300">Loading...</div>
              ) : null}
            </div>

            {sceneInspectorError ? (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
                {sceneInspectorError}
              </div>
            ) : null}

            {sceneInspector ? (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-6">
                <div className="space-y-6">
                  <SceneCard title="Object Summary" icon={<Info size={15} />}>
                    <KeyValue label="Address" value={sceneInspector.object.objectAddress} />
                    <KeyValue label="Active" value={sceneInspector.object.activeSelf ? 'true' : 'false'} />
                    <KeyValue label="Layer" value={sceneInspector.object.layer == null ? 'n/a' : String(sceneInspector.object.layer)} />
                    <KeyValue label="Tag" value={sceneInspector.object.tag ?? 'untagged'} />
                    <KeyValue label="Children" value={String(sceneInspector.object.childCount)} />
                    <KeyValue label="Components" value={sceneInspector.object.componentCount == null ? 'n/a' : String(sceneInspector.object.componentCount)} />
                  </SceneCard>

                  <SceneCard title="Transform" icon={<Box size={15} />}>
                    <VectorBlock label="Local Position" value={sceneInspector.transform?.localPosition} />
                    <VectorBlock label="Local Rotation" value={sceneInspector.transform?.localRotation} />
                    <VectorBlock label="Local Scale" value={sceneInspector.transform?.localScale} />
                    <KeyValue label="Parent Transform" value={sceneInspector.transform?.parentTransformAddress ?? 'none'} />
                    <KeyValue label="Parent Object" value={sceneInspector.transform?.parentObjectAddress ?? 'none'} />
                  </SceneCard>
                </div>

                <div className="space-y-6">
                  <SceneCard title="Children" icon={<Layers3 size={15} />}>
                    {sceneInspector.children.length === 0 ? (
                      <div className="text-sm text-slate-500">No immediate children.</div>
                    ) : sceneInspector.children.map((child) => (
                      <button
                        key={child.objectAddress}
                        onClick={() => setSelectedObjectAddress(child.objectAddress)}
                        className="w-full flex items-center justify-between rounded-xl border border-[#1c2838] bg-[#0a1018] px-3 py-3 text-left hover:border-cyan-500/30 hover:bg-[#0d1520] transition"
                      >
                        <div>
                          <div className="text-sm text-slate-200">{child.name}</div>
                          <div className="text-[11px] text-slate-500 mt-1">{child.objectAddress}</div>
                        </div>
                        <div className="text-[11px] text-slate-500">{child.childCount} children</div>
                      </button>
                    ))}
                  </SceneCard>

                  <SceneCard title="Components" icon={<Layers3 size={15} />}>
                    {sceneInspector.components.length === 0 ? (
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SceneCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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
  const expanded = expandedNodes[node.objectAddress] ?? false;
  const children = childrenByParent[node.objectAddress] ?? [];
  const loading = loadingChildrenByParent[node.objectAddress];
  const childError = childErrorByParent[node.objectAddress];

  return (
    <div>
      <div className={`mx-2 mt-1 rounded-xl border ${selectedObjectAddress === node.objectAddress ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-transparent hover:border-[#1c2838] hover:bg-white/5'} transition`}>
        <div className="flex items-center gap-1 px-2 py-2" style={{ paddingLeft: `${12 + depth * 18}px` }}>
          <button
            onClick={() => onToggle(node)}
            className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${node.hasChildren ? 'text-slate-400 hover:text-slate-200' : 'text-slate-700 cursor-default'}`}
          >
            {node.hasChildren ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <ChevronRight size={15} />}
          </button>
          <button onClick={() => onSelect(node.objectAddress)} className="min-w-0 flex-1 text-left">
            <div className="text-sm text-slate-200 truncate">{node.name}</div>
          </button>
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
        </div>
      ) : null}
    </div>
  );
}