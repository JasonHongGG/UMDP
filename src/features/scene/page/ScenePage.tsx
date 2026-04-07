import { useEffect, useState } from 'react';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { WorkspaceGate } from '@/shared/ui/WorkspaceGate';
import { SceneHierarchyPanel } from './components/SceneHierarchyPanel';
import { SceneInspectorView } from './components/SceneInspectorView';
import { SceneMousePickerSidebar } from './components/SceneMousePickerSidebar';
import { SceneSidebarTools } from './components/SceneSidebarTools';
import { SceneWorkspaceProvider, useSceneMousePickerState } from './SceneWorkspaceContext';

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
  const [isMousePickerOpen, setIsMousePickerOpen] = useState(false);
  const {
    scenePickerWindows,
    scenePickerWindowsLoading,
    scenePickerWindowsError,
    sceneMousePickerState,
    refreshScenePickerWindows,
    setSceneMousePickerTarget,
    startSceneMousePicker,
    stopSceneMousePicker,
    openSceneMousePickHit,
  } = useSceneMousePickerState();

  useEffect(() => {
    if (!isMousePickerOpen) {
      return;
    }

    refreshScenePickerWindows().catch(() => undefined);
  }, [isMousePickerOpen, refreshScenePickerWindows]);

  return (
    <div className="flex-1 flex overflow-hidden bg-[#081019]">
      <SceneSidebarTools
        isMousePickerOpen={isMousePickerOpen}
        setIsMousePickerOpen={setIsMousePickerOpen}
      />
      <SceneMousePickerSidebar
        isOpen={isMousePickerOpen}
        setIsOpen={setIsMousePickerOpen}
        windows={scenePickerWindows}
        windowsLoading={scenePickerWindowsLoading}
        windowsError={scenePickerWindowsError}
        pickerState={sceneMousePickerState}
        refreshWindows={refreshScenePickerWindows}
        setTargetWindow={setSceneMousePickerTarget}
        startMousePicker={startSceneMousePicker}
        stopMousePicker={stopSceneMousePicker}
        openPickedHit={openSceneMousePickHit}
      />
      <SceneHierarchyPanel />
      <div className="flex-1 min-w-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#09121c_0%,#0a0f16_55%,#071019_100%)]">
        <SceneInspectorView />
      </div>
    </div>
  );
}
