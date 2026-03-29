import { useWorkspaceShellState } from '@/domain/analysis/AnalysisWorkspaceContext';
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
  const { workspaceLifecycle } = useWorkspaceShellState();
  const detached = !workspaceLifecycle.processSession || !workspaceLifecycle.hasSnapshot;

  if (detached) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400">
        Attach to a Unity process and load metadata before opening the Scene workspace.
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
