import React from 'react';

interface MainLayoutProps {
    children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    return (
        <div className="h-screen w-screen bg-[#0e1620] text-slate-200 flex flex-col font-sans overflow-hidden relative shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] border border-cyan-500/10 rounded-xl select-none">
            {/* Ambient Background Glows mirroring UEDP_JH */}
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none opacity-50 mix-blend-screen" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none opacity-30 mix-blend-screen" />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-10 min-h-0 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
