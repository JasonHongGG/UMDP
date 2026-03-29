import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Map, RefreshCw } from 'lucide-react';
import type { RuntimeSceneNodeSummary } from '@/domain/analysis/contracts';
import { useSceneTreeState } from '../SceneWorkspaceContext';

export function SceneHierarchyPanel() {
  const {
    sceneWorkspace,
    refreshSceneWorkspace,
    selectedObjectAddress,
    setSelectedObjectAddress,
    childrenByParent,
    childTaskByParent,
    loadingChildrenByParent,
    childErrorByParent,
    ensureSceneObjectChildrenLoaded,
    stopSceneObjectChildrenObservation,
  } = useSceneTreeState();

  const [expandedSceneHandles, setExpandedSceneHandles] = useState<Record<number, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  const summary = useMemo(() => {
    const sceneCount = scenes.length;
    const rootCount = scenes.reduce((count, scene) => count + scene.roots.length, 0);
    return { sceneCount, rootCount };
  }, [scenes]);

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

    const nextExpanded = !(expandedNodes[node.objectAddress] ?? false);
    setExpandedNodes((previous) => ({
      ...previous,
      [node.objectAddress]: nextExpanded,
    }));

    if (nextExpanded && node.hasChildren) {
      ensureSceneObjectChildrenLoaded(node.objectAddress).catch(() => undefined);
      return;
    }

    stopSceneObjectChildrenObservation(node.objectAddress);
  };

  return (
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
                      childTaskByParent={childTaskByParent}
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
  childTaskByParent,
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
  childTaskByParent: Record<string, { loadedCount: number; totalCount: number; status: string }>;
  loadingChildrenByParent: Record<string, boolean>;
  childErrorByParent: Record<string, string | null>;
}) {
  const children = childrenByParent[node.objectAddress] ?? [];
  const taskState = childTaskByParent[node.objectAddress] ?? null;
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
          {loading ? (
            <div className="ml-10 px-4 py-1 text-xs text-cyan-300">
              Loading children {taskState?.loadedCount ?? 0}/{taskState?.totalCount ?? node.childCount}...
            </div>
          ) : null}
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
              childTaskByParent={childTaskByParent}
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
