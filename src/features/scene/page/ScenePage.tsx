import { useWorkspaceShellState } from '@/domain/workspace/WorkspaceShellContext';
import { SceneWorkspaceProvider } from './SceneWorkspaceContext';
import { SceneHierarchyPanel } from './components/SceneHierarchyPanel';
import { SceneInspectorView } from './components/SceneInspectorView';

export function ScenePage() {
  return (
    <SceneWorkspaceProvider>
      <SceneWorkspaceShell />
    </SceneWorkspaceProvider>
  );
}

function SceneWorkspaceShell() {
  const { pageReadiness } = useWorkspaceShellState();
  const readiness = pageReadiness.scene;

  if (!readiness.selectionReady) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400">
        <div className="max-w-xl px-6 text-center space-y-3">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
            {readiness.sessionReady ? readiness.catalogReady ? 'selection-ready pending' : 'catalog-ready pending' : 'session-ready pending'}
          </div>
          <div className="text-lg font-semibold text-slate-100">{readiness.title}</div>
          <div className="text-sm leading-6 text-slate-400">{readiness.description}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#081019]">
      <SceneHierarchyPanel />
      <div className="flex-1 min-w-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#09121c_0%,#0a0f16_55%,#071019_100%)]">
        <SceneInspectorView />
      </div>
    </div>
  );
}
