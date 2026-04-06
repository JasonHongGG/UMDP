import { Crosshair, LoaderCircle, MousePointerClick, RefreshCcw, Target, X } from 'lucide-react';
import type {
  ProcessWindowCandidate,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMouseTargetHit,
} from '@/domain/analysis/contracts';
import { formatScenePickerWindowLabel } from '../sceneMousePickerWindows';

interface SceneMousePickerSidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  windows: ProcessWindowCandidate[];
  windowsLoading: boolean;
  windowsError: string | null;
  pickerState: RuntimeSceneMousePickerSnapshot;
  refreshWindows: () => Promise<ProcessWindowCandidate[]>;
  setTargetWindow: (windowHandle: string | null) => Promise<void>;
  startMousePicker: () => Promise<void>;
  stopMousePicker: () => Promise<void>;
  openPickedHit: (hit: RuntimeSceneMouseTargetHit) => void;
}

function statusClasses(status: RuntimeSceneMousePickerSnapshot['status']) {
  switch (status) {
    case 'tracking-candidate':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case 'committed':
      return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300';
    case 'armed':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
    case 'cancelled':
      return 'border-slate-500/30 bg-slate-500/15 text-slate-300';
    case 'error':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-300';
    default:
      return 'border-[#1c2838] bg-[#05080c]/80 text-slate-400';
  }
}

function formatPoint(point: RuntimeSceneMousePickerSnapshot['cursorClientPosition']) {
  if (!point) {
    return '—';
  }

  return `${point.x}, ${point.y}`;
}

function formatHitPath(hit: RuntimeSceneMouseTargetHit) {
  const hierarchyPath = hit.hierarchyPath.map((entry) => entry.name).filter(Boolean).join(' / ');
  if (hierarchyPath.length > 0) {
    return hierarchyPath;
  }

  if (hit.sceneName) {
    return `${hit.sceneName} / ${hit.objectName}`;
  }

  return 'Live hierarchy preview unavailable';
}

function formatWindowSubline(window: ProcessWindowCandidate) {
  return `${window.clientRect.width}×${window.clientRect.height} · ${window.className || 'UnknownClass'} · ${window.windowHandle}`;
}

export function SceneMousePickerSidebar({
  isOpen,
  setIsOpen,
  windows,
  windowsLoading,
  windowsError,
  pickerState,
  refreshWindows,
  setTargetWindow,
  startMousePicker,
  stopMousePicker,
  openPickedHit,
}: SceneMousePickerSidebarProps) {
  const selectedWindowHandle = pickerState.targetWindow?.windowHandle ?? null;
  const hoverHit = pickerState.currentCandidate;
  const lastPick = pickerState.committedPick;

  return (
    <div className={`flex flex-col bg-[#070a0f]/95 backdrop-blur-xl relative z-20 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden border-r border-[#1c2838] shadow-[10px_0_30px_rgba(0,0,0,0.5)] ${isOpen ? 'w-[360px]' : 'w-0 border-r-0 shadow-none opacity-0'}`}>
      <div className="p-4 border-b border-[#1c2838] shrink-0 w-[360px]">
        <div className="flex items-center gap-2 mb-4">
          <Crosshair className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-200 flex-1">Mouse Picker</span>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-rose-500/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-4">
          <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-[0.2em] font-bold ${statusClasses(pickerState.status)}`}>
            <Target className="w-3.5 h-3.5" />
            {pickerState.status}
          </span>
          <button
            onClick={() => refreshWindows().catch(() => undefined)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#1c2838] bg-[#05080c]/80 text-[10px] uppercase tracking-[0.18em] font-bold text-slate-300 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors"
          >
            {windowsLoading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>

        <div className="rounded-xl border border-[#1c2838] bg-[#05080c]/75 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Live Status</div>
          <div className="text-sm font-semibold text-slate-100 leading-tight">
            {pickerState.statusDetail ?? 'Choose a target window, arm the picker, hover a collider-backed world object, then click once to open it.'}
          </div>
          <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/8 px-3 py-2 text-[11px] leading-relaxed text-cyan-100/80">
            Live hover is intentionally lightweight. Full inspector details load only after a successful click.
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
            <div className="rounded-lg bg-[#0a0f16]/80 border border-[#1c2838] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mb-1">Client</div>
              <div>{formatPoint(pickerState.cursorClientPosition)}</div>
            </div>
            <div className="rounded-lg bg-[#0a0f16]/80 border border-[#1c2838] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mb-1">Screen</div>
              <div>{formatPoint(pickerState.cursorScreenPosition)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            {pickerState.isRunning ? (
              <button
                onClick={() => stopMousePicker().catch(() => undefined)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-rose-500/25 bg-rose-500/10 text-xs font-bold uppercase tracking-[0.18em] text-rose-300 hover:bg-rose-500/15 transition-colors"
              >
                <MousePointerClick className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => startMousePicker().catch(() => undefined)}
                disabled={!pickerState.targetWindow}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300 hover:bg-cyan-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MousePointerClick className="w-4 h-4" />
                Arm Picker
              </button>
            )}
            {selectedWindowHandle ? (
              <button
                onClick={() => setTargetWindow(null).catch(() => undefined)}
                className="px-3 py-2 rounded-lg border border-[#1c2838] bg-[#05080c]/80 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 hover:text-slate-200 hover:border-slate-500/40 transition-colors"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 slim-scrollbar w-[360px]">
        <section className="rounded-xl border border-[#1c2838] bg-[#05080c]/75 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Target Window</div>
              <div className="text-xs text-slate-400 mt-1">Choose the game window whose client area should receive mouse picking. Keep it visible and use the foreground client area for best results.</div>
            </div>
          </div>

          {windowsError ? (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {windowsError}
            </div>
          ) : null}

          {windowsLoading ? (
            <div className="flex items-center justify-center h-28 text-cyan-500/60 gap-3">
              <LoaderCircle className="w-5 h-5 animate-spin" />
              <span className="text-[11px] uppercase tracking-[0.18em] font-bold">Scanning windows</span>
            </div>
          ) : windows.length > 0 ? (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 slim-scrollbar">
              {windows.map((window) => {
                const selected = selectedWindowHandle === window.windowHandle;
                return (
                  <button
                    key={window.windowHandle}
                    onClick={() => setTargetWindow(window.windowHandle).catch(() => undefined)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${selected ? 'border-cyan-500/35 bg-cyan-500/12 shadow-[0_0_18px_rgba(34,211,238,0.08)]' : 'border-[#1c2838] bg-[#0a0f16]/60 hover:border-cyan-500/20 hover:bg-[#0a0f16]/90'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold truncate ${selected ? 'text-cyan-200' : 'text-slate-100'}`}>
                          {formatScenePickerWindowLabel(window)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 truncate">{formatWindowSubline(window)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {window.isForeground ? <span className="text-[9px] uppercase tracking-[0.18em] text-emerald-300">Foreground</span> : null}
                        {window.isMinimized ? <span className="text-[9px] uppercase tracking-[0.18em] text-amber-300">Minimized</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-[#1c2838] bg-[#0a0f16]/60 px-3 py-4 text-xs text-slate-500 leading-relaxed">
              No visible top-level windows were found for the attached process.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#1c2838] bg-[#05080c]/75 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Hover Preview</div>
          <div className="rounded-lg border border-[#1c2838] bg-[#0a0f16]/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            V1 only supports collider-backed world objects that <span className="font-mono text-slate-300">Physics.Raycast</span> can hit.
          </div>
          {hoverHit ? (
            <div className="space-y-2">
              <button
                onClick={() => openPickedHit(hoverHit)}
                className="w-full text-left rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 hover:bg-cyan-500/12 transition-colors"
              >
                <div className="text-sm font-semibold text-cyan-100 truncate">{hoverHit.objectName}</div>
                <div className="mt-1 text-[11px] text-cyan-300/80 truncate">{formatHitPath(hoverHit)}</div>
                <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  <span>{hoverHit.sceneName ?? 'Unknown Scene'}</span>
                  <span>{hoverHit.distance != null ? `${hoverHit.distance.toFixed(2)}m` : 'distance n/a'}</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-[#1c2838] bg-[#0a0f16]/60 px-3 py-4 text-xs text-slate-500 leading-relaxed">
              Choose a target window, arm the picker, move the cursor over a collider-backed world object, then click once to open it.
            </div>
          )}

          {lastPick ? (
            <div className="rounded-lg border border-[#1c2838] bg-[#0a0f16]/70 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-1">Last Pick</div>
              <button onClick={() => openPickedHit(lastPick)} className="text-left w-full">
                <div className="text-sm font-semibold text-slate-100 truncate">{lastPick.objectName}</div>
                <div className="mt-1 text-[11px] text-slate-400 truncate">{formatHitPath(lastPick)}</div>
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-[#1c2838] bg-[#05080c]/75 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Recent Picks</div>
          {pickerState.recentPicks.length > 0 ? (
            <div className="space-y-2">
              {pickerState.recentPicks.map((hit) => (
                <button
                  key={`${hit.objectAddress}:${hit.observedAt}`}
                  onClick={() => openPickedHit(hit)}
                  className="w-full text-left rounded-lg border border-[#1c2838] bg-[#0a0f16]/60 px-3 py-2.5 hover:border-cyan-500/20 hover:bg-[#0a0f16]/90 transition-colors"
                >
                  <div className="text-sm font-semibold text-slate-100 truncate">{hit.objectName}</div>
                  <div className="mt-1 text-[11px] text-slate-400 truncate">{formatHitPath(hit)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[#1c2838] bg-[#0a0f16]/60 px-3 py-4 text-xs text-slate-500 leading-relaxed">
              Successful picks stay here for the current runtime session, so you can reopen them without clicking the game window again.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}