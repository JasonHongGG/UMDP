import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FolderPlus, Map as MapIcon, Play, RefreshCw, Search } from 'lucide-react';
import type {
  RuntimeSceneBuildSettingsEntry,
  RuntimeSceneDescriptor,
  RuntimeSceneKind,
  RuntimeSceneNodeSummary,
} from '@/domain/analysis/contracts';
import { collectLoadedSceneNodeRecords, type LoadedSceneNodeRecord } from '../loadedSceneNodes';
import { useSceneMutationState, useSceneTreeState } from '../SceneWorkspaceContext';

const VIRTUAL_OVERSCAN = 10;
const SCENE_HEADER_HEIGHT = 52;
const SCENE_CREATE_HEIGHT = 132;
const NODE_ROW_HEIGHT = 58;
const NODE_STATUS_HEIGHT = 28;
const SCENE_EMPTY_HEIGHT = 34;
const SCENE_GAP_HEIGHT = 14;

type SceneListItem =
  | {
      key: string;
      kind: 'scene-header';
      scene: RuntimeSceneDescriptor;
      expanded: boolean;
    }
  | {
      key: string;
      kind: 'scene-create';
      scene: RuntimeSceneDescriptor;
      rootName: string;
    }
  | {
      key: string;
      kind: 'scene-empty';
      sceneHandle: number;
    }
  | {
      key: string;
      kind: 'node';
      node: RuntimeSceneNodeSummary;
      depth: number;
      expanded: boolean;
      loading: boolean;
      childError: string | null;
      hasLoadedChildren: boolean;
      loadedChildren: RuntimeSceneNodeSummary[];
      taskState: { loadedCount: number; totalCount: number; status: string } | null;
    }
  | {
      key: string;
      kind: 'node-status';
      objectAddress: string;
      depth: number;
      tone: 'loading' | 'error' | 'empty';
      message: string;
    }
  | {
      key: string;
      kind: 'scene-gap';
    };

type ItemMetric = {
  item: SceneListItem;
  top: number;
  height: number;
};

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
  const {
    createSceneRoot,
    loadSceneByBuildIndex,
    sceneMutationState,
  } = useSceneMutationState();

  const [expandedSceneHandles, setExpandedSceneHandles] = useState<Record<number, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [rootNameBySceneHandle, setRootNameBySceneHandle] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const scenes = sceneWorkspace.snapshot?.scenes ?? [];
  const buildSettingsScenes = sceneWorkspace.snapshot?.buildSettingsScenes ?? [];
  const summary = useMemo(() => {
    const sceneCount = scenes.length;
    const rootCount = scenes.reduce((count, scene) => count + scene.roots.length, 0);
    return { sceneCount, rootCount };
  }, [scenes]);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const loadedNodeRecords = useMemo(() => collectLoadedSceneNodeRecords(sceneWorkspace, childrenByParent), [childrenByParent, sceneWorkspace]);
  const searchState = useMemo(() => {
    if (!deferredSearchQuery) {
      return null;
    }

    const visibleNodeAddresses = new Set<string>();
    const matchingNodeAddresses = new Set<string>();
    const recordByAddress = new Map(loadedNodeRecords.map((record) => [record.node.objectAddress, record]));

    loadedNodeRecords.forEach((record) => {
      if (!record.searchText.includes(deferredSearchQuery)) {
        return;
      }

      matchingNodeAddresses.add(record.node.objectAddress);

      let current: LoadedSceneNodeRecord | undefined = record;
      while (current) {
        if (visibleNodeAddresses.has(current.node.objectAddress)) {
          break;
        }

        visibleNodeAddresses.add(current.node.objectAddress);
        current = current.node.parentObjectAddress ? recordByAddress.get(current.node.parentObjectAddress) : undefined;
      }
    });

    return {
      matchCount: matchingNodeAddresses.size,
      matchingNodeAddresses,
      visibleNodeAddresses,
    };
  }, [deferredSearchQuery, loadedNodeRecords]);
  const searchActive = searchState != null;

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

  const flatItems = useMemo(() => {
    const items: SceneListItem[] = [];

    const appendNode = (node: RuntimeSceneNodeSummary, depth: number) => {
      if (searchState && !searchState.visibleNodeAddresses.has(node.objectAddress)) {
        return;
      }

      const loadedChildren = childrenByParent[node.objectAddress] ?? [];
      const visibleChildren = searchState
        ? loadedChildren.filter((child) => searchState.visibleNodeAddresses.has(child.objectAddress))
        : loadedChildren;
      const taskState = childTaskByParent[node.objectAddress] ?? null;
      const loading = loadingChildrenByParent[node.objectAddress] ?? false;
      const childError = childErrorByParent[node.objectAddress] ?? null;
      const hasLoadedChildren = Object.prototype.hasOwnProperty.call(childrenByParent, node.objectAddress);
      const expanded = searchState ? visibleChildren.length > 0 : (expandedNodes[node.objectAddress] ?? false);

      items.push({
        key: `node:${node.objectAddress}`,
        kind: 'node',
        node,
        depth,
        expanded,
        loading: searchState ? false : loading,
        childError,
        hasLoadedChildren,
        loadedChildren: visibleChildren,
        taskState: searchState ? null : taskState,
      });

      if (!expanded) {
        return;
      }

      if (!searchState && loading) {
        items.push({
          key: `node-status:loading:${node.objectAddress}`,
          kind: 'node-status',
          objectAddress: node.objectAddress,
          depth: depth + 1,
          tone: 'loading',
          message: `Loading children ${taskState?.loadedCount ?? 0}/${taskState?.totalCount ?? node.childCount}...`,
        });
      }

      if (!searchState && childError) {
        items.push({
          key: `node-status:error:${node.objectAddress}`,
          kind: 'node-status',
          objectAddress: node.objectAddress,
          depth: depth + 1,
          tone: 'error',
          message: childError,
        });
      }

      if (!searchState && !loading && !childError && hasLoadedChildren && loadedChildren.length === 0) {
        items.push({
          key: `node-status:empty:${node.objectAddress}`,
          kind: 'node-status',
          objectAddress: node.objectAddress,
          depth: depth + 1,
          tone: 'empty',
          message: 'No children.',
        });
      }

      visibleChildren.forEach((child) => appendNode(child, depth + 1));
    };

    scenes.forEach((scene) => {
      const visibleRoots = searchState
        ? scene.roots.filter((node) => searchState.visibleNodeAddresses.has(node.objectAddress))
        : scene.roots;

      if (searchState && visibleRoots.length === 0) {
        return;
      }

      const expanded = expandedSceneHandles[scene.sceneHandle] ?? true;
      items.push({
        key: `scene-header:${scene.sceneHandle}`,
        kind: 'scene-header',
        scene,
        expanded,
      });

      if (expanded) {
        if (!searchState) {
          items.push({
            key: `scene-create:${scene.sceneHandle}`,
            kind: 'scene-create',
            scene,
            rootName: rootNameBySceneHandle[scene.sceneHandle] ?? 'GameObject',
          });
        }

        if (!searchState && scene.roots.length === 0) {
          items.push({
            key: `scene-empty:${scene.sceneHandle}`,
            kind: 'scene-empty',
            sceneHandle: scene.sceneHandle,
          });
        }

        visibleRoots.forEach((node) => appendNode(node, 0));
      }

      items.push({
        key: `scene-gap:${scene.sceneHandle}`,
        kind: 'scene-gap',
      });
    });

    return items;
  }, [
    childErrorByParent,
    childTaskByParent,
    childrenByParent,
    expandedNodes,
    expandedSceneHandles,
    loadingChildrenByParent,
    rootNameBySceneHandle,
    scenes,
    searchState,
  ]);

  const deferredFlatItems = useDeferredValue(flatItems);

  const itemMetrics = useMemo(() => {
    const metrics: ItemMetric[] = [];
    let offset = 0;

    deferredFlatItems.forEach((item) => {
      const height = getItemHeight(item);
      metrics.push({ item, top: offset, height });
      offset += height;
    });

    return {
      metrics,
      totalHeight: offset,
    };
  }, [deferredFlatItems]);

  const visibleRange = useMemo(() => {
    if (itemMetrics.metrics.length === 0) {
      return { startIndex: 0, endIndex: -1 };
    }

    const viewportBottom = scrollTop + viewportHeight;
    const rawStartIndex = findItemIndex(itemMetrics.metrics, scrollTop);
    const rawEndIndex = findItemIndex(itemMetrics.metrics, viewportBottom);

    return {
      startIndex: Math.max(0, rawStartIndex - VIRTUAL_OVERSCAN),
      endIndex: Math.min(itemMetrics.metrics.length - 1, rawEndIndex + VIRTUAL_OVERSCAN),
    };
  }, [itemMetrics.metrics, scrollTop, viewportHeight]);

  const visibleMetrics = useMemo(() => {
    if (visibleRange.endIndex < visibleRange.startIndex) {
      return [] as ItemMetric[];
    }

    return itemMetrics.metrics.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [itemMetrics.metrics, visibleRange.endIndex, visibleRange.startIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => {
      setViewportHeight(container.clientHeight);
    };

    updateViewportHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportHeight);
      return () => {
        window.removeEventListener('resize', updateViewportHeight);
      };
    }

    const observer = new ResizeObserver(() => updateViewportHeight());
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!selectedObjectAddress || !scrollContainerRef.current) {
      return;
    }

    const selectedMetric = itemMetrics.metrics.find((metric) => metric.item.kind === 'node' && metric.item.node.objectAddress === selectedObjectAddress);
    if (!selectedMetric) {
      return;
    }

    const container = scrollContainerRef.current;
    const itemTop = selectedMetric.top;
    const itemBottom = itemTop + selectedMetric.height;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;

    if (itemTop < viewportTop) {
      container.scrollTop = itemTop;
      return;
    }

    if (itemBottom > viewportBottom) {
      container.scrollTop = Math.max(0, itemBottom - container.clientHeight);
    }
  }, [itemMetrics.metrics, selectedObjectAddress]);

  return (
    <div className="w-[430px] shrink-0 border-r border-[#1c2838] bg-[#05080c]/95 flex flex-col">
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

      <div className="px-4 pt-4">
        <label className="rounded-2xl border border-[#142132] bg-[#09111a]/80 px-3 py-3 flex items-center gap-3">
          <Search size={15} className="text-cyan-300 shrink-0" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            placeholder="Search loaded objects"
          />
          {searchActive ? <span className="text-[11px] text-slate-500 shrink-0">loaded only</span> : null}
        </label>
        <div className="mt-2 text-[11px] text-slate-500">
          {searchActive
            ? `${searchState.matchCount} loaded matches`
            : 'Search only covers roots and children that have already been loaded.'}
        </div>
      </div>

      {sceneWorkspace.errorMessage ? (
        <div className="mx-4 mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          {sceneWorkspace.errorMessage}
        </div>
      ) : null}

      {buildSettingsScenes.length > 0 ? (
        <div className="px-3 pt-3">
          <div className="rounded-2xl border border-[#142132] bg-[#09111a]/80 overflow-hidden">
            <div className="px-3 py-3 border-b border-[#142132] text-xs uppercase tracking-[0.18em] text-slate-500">
              Build Settings Scenes
            </div>
            <div className="max-h-48 overflow-y-auto slim-scrollbar p-2 space-y-2">
              {buildSettingsScenes.map((scene) => (
                <div key={scene.buildIndex} className="rounded-xl border border-[#1c2838] bg-[#0a0f16]/80 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-200 truncate">{scene.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500 break-all">#{scene.buildIndex} • {scene.path}</div>
                    </div>
                    <button
                      onClick={() => loadSceneByBuildIndex(scene.buildIndex).catch(() => undefined)}
                      disabled={sceneMutationState.loading || scene.isLoaded}
                      className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="inline-flex items-center gap-2"><Play size={12} />{scene.isLoaded ? 'Loaded' : 'Load'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {sceneWorkspace.refreshStatus === 'refreshing' && !sceneWorkspace.snapshot ? (
        <div className="px-4 py-3 text-sm text-slate-400">Refreshing scene catalog...</div>
      ) : null}

      {!sceneWorkspace.snapshot && sceneWorkspace.refreshStatus === 'idle' ? (
        <div className="px-4 py-3 text-sm text-slate-400">No scene snapshot yet. Click refresh to enumerate loaded scenes.</div>
      ) : null}

      {searchActive && searchState.matchCount === 0 ? (
        <div className="mx-4 mt-4 rounded-xl border border-[#172231] bg-[#091019] px-3 py-3 text-sm text-slate-400">
          No loaded objects match this filter yet.
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto slim-scrollbar px-2 py-3"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: `${itemMetrics.totalHeight}px` }}>
          {visibleMetrics.map((metric) => (
            <div
              key={metric.item.key}
              className="absolute left-0 w-full"
              style={{ top: `${metric.top}px`, height: `${metric.height}px` }}
            >
              <SceneVirtualRow
                item={metric.item}
                selectedObjectAddress={selectedObjectAddress}
                sceneMutationLoading={sceneMutationState.loading}
                onSelect={setSelectedObjectAddress}
                onToggleScene={toggleScene}
                onToggleNode={toggleNode}
                onRootNameChange={(sceneHandle, value) => setRootNameBySceneHandle((previous) => ({
                  ...previous,
                  [sceneHandle]: value,
                }))}
                onCreateRoot={createSceneRoot}
                searchActive={searchActive}
                searchMatches={searchState?.matchingNodeAddresses ?? null}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneVirtualRow({
  item,
  selectedObjectAddress,
  sceneMutationLoading,
  onSelect,
  onToggleScene,
  onToggleNode,
  onRootNameChange,
  onCreateRoot,
  searchActive,
  searchMatches,
}: {
  item: SceneListItem;
  selectedObjectAddress: string | null;
  sceneMutationLoading: boolean;
  onSelect: (objectAddress: string) => void;
  onToggleScene: (sceneHandle: number) => void;
  onToggleNode: (node: RuntimeSceneNodeSummary) => void;
  onRootNameChange: (sceneHandle: number, value: string) => void;
  onCreateRoot: (sceneHandle: number, name: string) => Promise<unknown>;
  searchActive: boolean;
  searchMatches: Set<string> | null;
}) {
  switch (item.kind) {
    case 'scene-header':
      return (
        <div className="px-1 h-full">
          <button
            onClick={() => onToggleScene(item.scene.sceneHandle)}
            className="w-full h-full rounded-2xl border border-[#142132] bg-[#0a0f16]/80 px-3 flex items-center gap-2 text-left text-sm text-slate-200 hover:bg-white/5 transition"
          >
            {item.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <MapIcon size={15} className="text-cyan-300" />
            <span className="font-medium truncate">{item.scene.name}</span>
            <SceneKindBadge kind={item.scene.kind} />
            <span className="ml-auto text-[11px] text-slate-500">{item.scene.roots.length} roots</span>
          </button>
        </div>
      );
    case 'scene-create':
      return (
        <div className="px-1 pt-2 h-full">
          <div className="h-full rounded-2xl border border-[#142132] bg-[#0a0f16]/80 px-3 py-3">
            <div className="rounded-xl border border-[#172231] bg-[#091019] px-3 py-3 h-full flex flex-col justify-center">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <FolderPlus size={13} className="text-cyan-300" />
                Create Root Object
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={item.rootName}
                  onChange={(event) => onRootNameChange(item.scene.sceneHandle, event.target.value)}
                  className="flex-1 rounded-lg border border-[#1c2838] bg-[#0d1520] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                  placeholder="GameObject"
                />
                <button
                  onClick={() => onCreateRoot(item.scene.sceneHandle, item.rootName.trim() || 'GameObject').catch(() => undefined)}
                  disabled={sceneMutationLoading}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 break-all">
                Handle #{item.scene.sceneHandle}
                {item.scene.buildIndex != null ? ` • Build ${item.scene.buildIndex}` : ''}
                {item.scene.path ? ` • ${item.scene.path}` : ''}
              </div>
            </div>
          </div>
        </div>
      );
    case 'scene-empty':
      return (
        <div className="px-4 h-full flex items-center text-xs text-slate-500">
          Scene has no root objects yet.
        </div>
      );
    case 'node-status': {
      const textClass = item.tone === 'error'
        ? 'text-rose-300'
        : item.tone === 'loading'
          ? 'text-cyan-300'
          : 'text-slate-500';
      return (
        <div className={`px-4 h-full flex items-center text-xs ${textClass}`} style={{ paddingLeft: `${30 + item.depth * 18}px` }}>
          {item.message}
        </div>
      );
    }
    case 'scene-gap':
      return <div className="h-full" />;
    case 'node': {
      const canExpand = searchActive ? item.loadedChildren.length > 0 : (item.node.hasChildren || item.loadedChildren.length > 0);
      const searchMatched = searchMatches?.has(item.node.objectAddress) ?? false;
      return (
        <div className="px-1 h-full">
          <div className={`h-full rounded-xl border ${selectedObjectAddress === item.node.objectAddress ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-transparent hover:border-[#1c2838] hover:bg-white/5'} transition`}>
            <div className="h-full flex items-center gap-1 px-2" style={{ paddingLeft: `${12 + item.depth * 18}px` }}>
              <button
                onClick={() => onToggleNode(item.node)}
                disabled={!canExpand}
                className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${canExpand ? 'text-slate-400 hover:text-slate-200' : 'text-slate-700 cursor-default'}`}
              >
                {item.expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <button onClick={() => onSelect(item.node.objectAddress)} className="min-w-0 flex-1 text-left">
                <div className={`text-sm truncate ${searchMatched ? 'text-cyan-200' : 'text-slate-200'}`}>{item.node.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{item.node.activeSelf ? 'active' : 'inactive'}</span>
                  {item.node.tag ? <span>tag:{item.node.tag}</span> : null}
                  {item.node.layer != null ? <span>layer:{item.node.layer}</span> : null}
                </div>
              </button>
              {(item.node.hasChildren || item.hasLoadedChildren) ? <span className="text-[11px] text-slate-500 shrink-0">{item.node.childCount}</span> : null}
            </div>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function getItemHeight(item: SceneListItem) {
  switch (item.kind) {
    case 'scene-header':
      return SCENE_HEADER_HEIGHT;
    case 'scene-create':
      return SCENE_CREATE_HEIGHT;
    case 'scene-empty':
      return SCENE_EMPTY_HEIGHT;
    case 'node':
      return NODE_ROW_HEIGHT;
    case 'node-status':
      return NODE_STATUS_HEIGHT;
    case 'scene-gap':
      return SCENE_GAP_HEIGHT;
    default:
      return NODE_ROW_HEIGHT;
  }
}

function findItemIndex(metrics: ItemMetric[], offset: number) {
  let low = 0;
  let high = metrics.length - 1;
  let result = metrics.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];
    const bottom = metric.top + metric.height;
    if (offset < bottom) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return result;
}

function BuildSettingsSection({
  scenes,
  loading,
  onLoadScene,
}: {
  scenes: RuntimeSceneBuildSettingsEntry[];
  loading: boolean;
  onLoadScene: (buildIndex: number) => Promise<unknown>;
}) {
  return (
    <div className="rounded-2xl border border-[#142132] bg-[#09111a]/80 overflow-hidden">
      <div className="px-3 py-3 border-b border-[#142132] text-xs uppercase tracking-[0.18em] text-slate-500">
        Build Settings Scenes
      </div>
      <div className="max-h-48 overflow-y-auto slim-scrollbar p-2 space-y-2">
        {scenes.map((scene) => (
          <div key={scene.buildIndex} className="rounded-xl border border-[#1c2838] bg-[#0a0f16]/80 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">{scene.name}</div>
                <div className="mt-1 text-[11px] text-slate-500 break-all">#{scene.buildIndex} • {scene.path}</div>
              </div>
              <button
                onClick={() => onLoadScene(scene.buildIndex).catch(() => undefined)}
                disabled={loading || scene.isLoaded}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="inline-flex items-center gap-2"><Play size={12} />{scene.isLoaded ? 'Loaded' : 'Load'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneKindBadge({ kind }: { kind: RuntimeSceneKind }) {
  const tone = kind === 'dont-destroy-on-load'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : kind === 'hide-and-dont-save'
      ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';

  const label = kind === 'dont-destroy-on-load'
    ? 'DDoL'
    : kind === 'hide-and-dont-save'
      ? 'Hidden'
      : 'Loaded';

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{label}</span>;
}
