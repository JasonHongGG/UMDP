
import { Suspense, lazy } from 'react';
import { MainLayout } from '@/app/shell/MainLayout';
import { TopBar } from '@/app/shell/TopBar';
import { AnalysisWorkspaceProvider, useWorkspaceShellState } from './domain/analysis/AnalysisWorkspaceContext';
import { StatusBar } from './app/shell/StatusBar';
import { openProcessSelectorWindow } from './infrastructure/tauri/TauriWorkspaceGateway';
import './styles.css';

const StudioPage = lazy(async () => ({
  default: (await import('@/features/studio/page/StudioPage')).StudioPage,
}));

const InspectorPage = lazy(async () => ({
  default: (await import('@/features/inspector/page/InspectorPage')).InspectorPage,
}));

export default function App() {
  return (
    <AnalysisWorkspaceProvider>
      <AppContent />
    </AnalysisWorkspaceProvider>
  );
}

function AppContent() {
  const {
    workspaceLifecycle,
    activePage,
    setActivePage,
  } = useWorkspaceShellState();

  return (
    <MainLayout>
      <TopBar
        workspace={workspaceLifecycle}
        onOpenSelector={openProcessSelectorWindow}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      <Suspense fallback={<WorkspacePageFallback activePage={activePage} />}>
        {activePage === 'inspector' ? (
          <InspectorPage />
        ) : (
          <StudioPage />
        )}
      </Suspense>

      <StatusBar workspace={workspaceLifecycle} />
    </MainLayout>
  );
}

function WorkspacePageFallback({ activePage }: { activePage: 'studio' | 'inspector' }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0a0f16] text-slate-400 text-sm tracking-wide">
      Loading {activePage === 'inspector' ? 'Inspector' : 'Studio'} workspace...
    </div>
  );
}
