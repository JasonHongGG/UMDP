
import { Suspense, lazy } from 'react';
import { AppInfrastructureProvider, useAppInfrastructure } from '@/app/AppInfrastructureContext';
import { AppStateProvider } from '@/app/state/AppStateProvider';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { MainLayout } from '@/app/shell/MainLayout';
import { TopBar } from '@/app/shell/TopBar';
import { StatusBar } from './app/shell/StatusBar';
import { SceneWorkspaceProvider } from '@/features/scene/page/SceneWorkspaceContext';
import './styles.css';

const StudioPage = lazy(async () => ({
  default: (await import('@/features/studio/page/StudioPage')).StudioPage,
}));

const InspectorPage = lazy(async () => ({
  default: (await import('@/features/inspector/page/InspectorPage')).InspectorPage,
}));

const ScenePage = lazy(async () => ({
  default: (await import('@/features/scene/page/ScenePage')).ScenePage,
}));

export default function App() {
  return (
    <AppInfrastructureProvider>
      <AppStateProvider>
        <AppContent />
      </AppStateProvider>
    </AppInfrastructureProvider>
  );
}

function AppContent() {
  const { workspaceAttachIntentChannel } = useAppInfrastructure();
  const {
    workspaceLifecycle,
    workspacePresentation,
    activePage,
    setActivePage,
  } = useWorkspaceShellState();

  return (
    <MainLayout>
      <TopBar
        workspace={workspaceLifecycle}
        workspacePresentation={workspacePresentation}
        onOpenSelector={() => {
          workspaceAttachIntentChannel.openProcessSelector().catch(() => undefined);
        }}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      <SceneWorkspaceProvider>
        <Suspense fallback={<WorkspacePageFallback activePage={activePage} />}>
          {activePage === 'inspector' ? (
            <InspectorPage />
          ) : activePage === 'scene' ? (
            <ScenePage />
          ) : (
            <StudioPage />
          )}
        </Suspense>
      </SceneWorkspaceProvider>

      <StatusBar presentation={workspacePresentation} />
    </MainLayout>
  );
}

function WorkspacePageFallback({ activePage }: { activePage: 'studio' | 'inspector' | 'scene' }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400 text-sm tracking-wide">
      Loading {activePage === 'inspector' ? 'Inspector' : activePage === 'scene' ? 'Scene' : 'Studio'} workspace...
    </div>
  );
}
