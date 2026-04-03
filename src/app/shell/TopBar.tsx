import { Target, X, Square, Minus, Cpu } from 'lucide-react';
import { TopNavigation } from './TopNavigation';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import type { WorkspacePresentation } from '@/kernel/workspace/derive';
import {
    closeCurrentWindow,
    minimizeCurrentWindow,
    toggleCurrentWindowMaximized,
} from '@/infrastructure/tauri/TauriWindowGateway';

interface TopBarProps {
    onOpenSelector: () => void;
    activePage: 'inspector' | 'studio' | 'scene';
    onPageChange: (page: 'inspector' | 'studio' | 'scene') => void;
    workspace: WorkspaceLifecycleState;
    workspacePresentation: WorkspacePresentation;
}

export function TopBar({ onOpenSelector, activePage, onPageChange, workspace, workspacePresentation }: TopBarProps) {
    const hasAttachedProcess = Boolean(workspace.processSession);

    const handleMinimize = () => {
        minimizeCurrentWindow().catch(() => undefined);
    };

    const handleToggleMaximize = async () => {
        await toggleCurrentWindowMaximized();
    };

    const handleClose = () => {
        closeCurrentWindow().catch(() => undefined);
    };

    return (
        <div data-tauri-drag-region className="flex items-center justify-between px-5 py-3 bg-[#05080c] border-b border-[#1c2838] shadow-[0_4px_15px_rgba(0,0,0,0.4)] z-30 relative shrink-0 text-slate-200">
            <div data-tauri-drag-region className="flex items-center gap-3 relative z-10">
                <div data-tauri-drag-region className="relative flex items-center justify-center w-8 h-8">
                    <div className={`absolute inset-0 rounded-full blur-[6px] opacity-40 transition-colors duration-500 ${hasAttachedProcess ? 'bg-cyan-500 animate-[pulse_2s_ease-in-out_infinite]' : 'bg-rose-500 opacity-20'}`} />
                    <div className={`relative z-10 transition-colors duration-500 ${hasAttachedProcess ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-rose-400/50'}`}>
                        <Target size={16} strokeWidth={2.5} className="pointer-events-none" />
                    </div>
                </div>

                <div data-tauri-drag-region className="flex flex-col justify-center">
                    <h2 data-tauri-drag-region className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Workspace</h2>
                    {workspace.processSession ? (
                        <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{`${workspace.processSession.processName} (${workspace.processSession.pid})`}</span>
                    ) : (
                        <span className="text-rose-400/80 pointer-events-none">No Process Attached</span>
                    )}
                </div>
            </div>

            {/* Page Navigation Component */}
            <TopNavigation activePage={activePage} onPageChange={onPageChange} pages={workspacePresentation.pages} />

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
