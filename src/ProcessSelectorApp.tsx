import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { ProcessInfo } from './types';
import { createDiagnosticsLogger } from '@/shared/diagnostics';
import {
  emitProcessSelected,
  fetchSystemProcesses,
  onRefreshProcesses,
} from './infrastructure/tauri/TauriWorkspaceGateway';
import {
  hideCurrentWindow,
  onCurrentWindowFocusChanged,
} from './infrastructure/tauri/TauriWindowGateway';
import './styles.css';

const processSelectorDiagnostics = createDiagnosticsLogger({
  channel: 'process-selector',
  origin: 'ProcessSelectorApp',
});

export default function ProcessSelectorApp() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return processes;
    }
    return processes.filter((process) => process.name.toLowerCase().includes(keyword) || String(process.pid).includes(keyword));
  }, [processes, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const load = async () => {
      const next = await fetchSystemProcesses();
      setProcesses(next);
    };

    load().catch((error) => processSelectorDiagnostics.error('Process list load failed.', {
      error,
    }));
    setTimeout(() => inputRef.current?.focus(), 50);

    let unlistenFocus: (() => void) | undefined;

    const timer = setTimeout(() => {
      onCurrentWindowFocusChanged((focused) => {
        if (!focused) {
          hideCurrentWindow().catch(() => undefined);
        }
      }).then((dispose) => {
        unlistenFocus = dispose;
      }).catch(() => undefined);
    }, 300);

    const refreshPromise = onRefreshProcesses(() => {
      load().catch((error) => processSelectorDiagnostics.error('Process list refresh failed.', {
        error,
      }));
      setTimeout(() => inputRef.current?.focus(), 50);
    });

    return () => {
      clearTimeout(timer);
      unlistenFocus?.();
      refreshPromise.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  const selectProcess = async (process: ProcessInfo) => {
    await emitProcessSelected(process);
    await hideCurrentWindow();
    setSearch('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      hideCurrentWindow().catch(() => undefined);
      return;
    }

    if (!filtered.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, filtered.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        selectProcess(selected).catch((error) => processSelectorDiagnostics.error('Process selection failed.', {
          error,
          context: {
            pid: selected.pid,
            processName: selected.name,
          },
        }));
      }
    }
  };

  return (
    <div data-tauri-drag-region className="w-full h-screen bg-[#0e1620]/95 backdrop-blur-2xl border border-cyan-500/20 rounded-xl flex flex-col overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.1)] font-sans text-slate-200 select-none relative">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none opacity-40 mix-blend-screen -z-10" />

      {/* Search Input Area */}
      <div data-tauri-drag-region className="flex items-center px-4 py-4 border-b border-[#1c2838] bg-[#0a0f16]">
        <Search size={22} className="text-cyan-400 mr-3 pointer-events-none drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search attached processes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-xl font-medium text-slate-100 placeholder:text-slate-500/70 focus:outline-none focus:ring-0"
          autoFocus
        />
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto w-full hide-scrollbar py-2 relative z-10" ref={listRef}>
        {filtered.length > 0 ? (
          filtered.map((p, idx) => (
            <div
              key={p.pid}
              onClick={() => selectProcess(p).catch((error) => processSelectorDiagnostics.error('Process selection failed.', {
                error,
                context: {
                  pid: p.pid,
                  processName: p.name,
                },
              }))}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`px-4 py-3 mx-2 my-1 rounded-lg cursor-pointer transition-all duration-150 flex items-center justify-between border ${selectedIndex === idx
                ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] text-white'
                : 'bg-transparent border-transparent hover:bg-white/5 text-slate-300'
                }`}
            >
              <div className="flex flex-col">
                <span className={`text-base font-medium truncate pr-4 ${selectedIndex === idx ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'text-slate-300'}`}>
                  {p.name}
                </span>
                <span className="text-xs text-slate-500 mt-0.5">Attach and inspect managed assemblies</span>
              </div>
              <span className={`text-xs whitespace-nowrap px-2 py-0.5 rounded font-mono border ${selectedIndex === idx ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)]' : 'bg-[#05080c] border-[#1c2838] text-slate-500'}`}>
                PID: {p.pid}
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
            <Search size={32} className="opacity-20" />
            <span className="text-sm font-medium">No visible process matched the current filter.</span>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[#1c2838] bg-[#05080c] text-[10px] text-slate-500 flex justify-between items-center relative z-20">
        <span>Use <kbd className="font-sans px-1 py-0.5 bg-[#131b26] border border-[#1c2838] rounded shadow-sm text-slate-400">↑</kbd> <kbd className="font-sans px-1 py-0.5 bg-[#131b26] border border-[#1c2838] rounded shadow-sm text-slate-400">↓</kbd> to navigate</span>
        <span>Press <kbd className="font-sans px-1 py-0.5 bg-[#131b26] border border-[#1c2838] rounded shadow-sm text-slate-300">Enter</kbd> to attach, <kbd className="font-sans px-1 py-0.5 bg-[#131b26] border border-[#1c2838] rounded shadow-sm text-slate-300">Esc</kbd> to close</span>
      </div>
    </div>
  );
}
