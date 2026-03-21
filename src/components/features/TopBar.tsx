import { Target, X, Square, Minus, Cpu } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TopNavigation } from './TopNavigation';
import type { WorkspaceLifecycleState } from '../../shared/contracts';
import { getWorkspaceLifecycleLabel, getWorkspaceLifecycleTone } from '../../app/shell/workspaceLifecycle';

interface TopBarProps {
    attachedProcess: string | null;
    onOpenSelector: () => void;
    activePage: 'inspector' | 'studio';
    onPageChange: (page: 'inspector' | 'studio') => void;
    workspace: WorkspaceLifecycleState;
}

export function TopBar({ attachedProcess, onOpenSelector, activePage, onPageChange, workspace }: TopBarProps) {
    const window = getCurrentWindow();
    const lifecycleLabel = getWorkspaceLifecycleLabel(workspace);
    const lifecycleTone = getWorkspaceLifecycleTone(workspace);
    const lifecycleClassName = lifecycleTone === 'ready'
        ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
        : lifecycleTone === 'loading'
            ? 'text-amber-300'
            : lifecycleTone === 'error'
                ? 'text-rose-400'
                : lifecycleTone === 'warning'
                    ? 'text-amber-300'
                    : 'text-slate-400';

    const handleMinimize = () => {
        window.minimize();
    };

    const handleToggleMaximize = async () => {
        if (await window.isMaximized()) {
            window.unmaximize();
        } else {
            window.maximize();
        }
    };

    const handleClose = () => {
        window.close();
    };

    return (
        <div data-tauri-drag-region className="flex items-center justify-between px-5 py-3 bg-[#05080c] border-b border-[#1c2838] shadow-[0_4px_15px_rgba(0,0,0,0.4)] z-30 relative shrink-0 text-slate-200">
            <div data-tauri-drag-region className="flex items-center gap-3 relative z-10">
                <div data-tauri-drag-region className="relative flex items-center justify-center w-8 h-8">
                    {/* Glowing pulse behind icon */}
                    <div className={`absolute inset-0 rounded-full blur-[6px] opacity-40 transition-colors duration-500 ${attachedProcess ? 'bg-cyan-500 animate-[pulse_2s_ease-in-out_infinite]' : 'bg-rose-500 opacity-20'}`} />
                    <div className={`relative z-10 transition-colors duration-500 ${attachedProcess ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-rose-400/50'}`}>
                        <Target size={16} strokeWidth={2.5} className="pointer-events-none" />
                    </div>
                </div>

                <div data-tauri-drag-region className="flex flex-col justify-center">
                    <h2 data-tauri-drag-region className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Workspace</h2>
                    <div data-tauri-drag-region className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
                        {attachedProcess ? (
                            <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{attachedProcess}</span>
                        ) : (
                            <span className="text-rose-400/80 pointer-events-none">No Process Attached</span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wider ${lifecycleClassName}`}>{lifecycleLabel}</span>
                    </div>
                </div>
            </div>

            {/* Page Navigation Component */}
            <TopNavigation activePage={activePage} onPageChange={onPageChange} />

            <div className="flex items-center gap-2 relative z-10">
                <button
                    onClick={onOpenSelector}
                    title="Select Process"
                    className="group flex items-center justify-center w-9 h-9 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 rounded-lg transition-all duration-300 border border-cyan-500/30 hover:border-cyan-500/60 hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] active:scale-95 mr-2"
                >
                    <Cpu size={18} />
                </button>

                <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

                <button
                    onClick={handleMinimize}
                    title="Minimize"
                    className="group flex items-center justify-center w-9 h-9 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all duration-300 border border-transparent hover:border-white/10"
                >
                    <Minus size={16} className="transition-all" />
                </button>
                <button
                    onClick={handleToggleMaximize}
                    title="Maximize / Restore"
                    className="group flex items-center justify-center w-9 h-9 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all duration-300 border border-transparent hover:border-white/10"
                >
                    <Square size={14} className="transition-all" />
                </button>
                <button
                    onClick={handleClose}
                    title="Close Window"
                    className="group flex items-center justify-center w-9 h-9 bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-all duration-300 border border-transparent hover:border-rose-500/40"
                >
                    <X size={18} className="group-hover:drop-shadow-[0_0_8px_rgba(244,63,94,0.6)] transition-all" />
                </button>
            </div>
        </div>
    );
}
