import { useWorkspaceShellState } from '@/domain/workspace/WorkspaceShellContext';
import { WorkspaceGate } from '@/shared/ui/WorkspaceGate';
import { SceneWorkspaceProvider } from './SceneWorkspaceContext';
import { SceneHierarchyPanel } from './components/SceneHierarchyPanel';
import { SceneInspectorView } from './components/SceneInspectorView';

export function ScenePage() {
  const { workspacePresentation } = useWorkspaceShellState();
  const detail = workspacePresentation.pages.scene;

  if (detail.blocked) {
    return <WorkspaceGate detail={detail} />;
  }

  return (
    <SceneWorkspaceProvider>
      <SceneWorkspaceShell />
    </SceneWorkspaceProvider>
  );
}

function SceneWorkspaceShell() {
  return (
    <div className="flex-1 flex overflow-hidden bg-[#081019]">
      <SceneHierarchyPanel />
      <div className="flex-1 min-w-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#09121c_0%,#0a0f16_55%,#071019_100%)]">
        <SceneInspectorView />
      </div>
    </div>
  );
}
