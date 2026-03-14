import { LayoutDashboard } from 'lucide-react';

export function StudioPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0f16]/60 backdrop-blur-xl transition-opacity duration-500 text-slate-500 gap-4">
      <div className="relative group w-24 h-24 rounded-3xl bg-[#0a0f16] flex items-center justify-center shadow-inner mb-2 border border-[#1c2838] hover:border-cyan-500/50 transition-colors">
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-cyan-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        <LayoutDashboard size={40} className="text-slate-600 group-hover:text-cyan-400 group-hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-all duration-500" />
      </div>

      <h2 className="text-2xl font-bold bg-gradient-to-br from-slate-200 to-slate-500 bg-clip-text text-transparent drop-shadow-md">
        Studio Workspace
      </h2>
      
      <p className="max-w-[400px] text-center text-[14px] leading-relaxed drop-shadow text-slate-400">
        Design and composite your interactive dashboard here. Features coming soon.
      </p>

      {/* Subtle decorative grid/dots in background? Just keeping it clean for now */}
    </div>
  );
}
