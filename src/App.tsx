
import { Suspense, lazy } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import { AnalysisWorkspaceProvider, useAnalysisWorkspace } from './domain/analysis/AnalysisWorkspaceContext';
import { StatusBar } from './app/shell/StatusBar';
import { useWorkspaceShellFacade } from './app/facades/useWorkspaceShellFacade';
import './styles.css';

const StudioPage = lazy(async () => ({
  default: (await import('./components/features/StudioPage')).StudioPage,
}));

const InspectorPage = lazy(async () => ({
  default: (await import('./app/pages/InspectorPage')).InspectorPage,
}));

export default function App() {
  return (
    <AnalysisWorkspaceProvider>
      <AppContent />
    </AnalysisWorkspaceProvider>
  );
}

function AppContent() {
  const { workspace, contractVersions, processSession, activePage, setActivePage, openSelector } = useWorkspaceShellFacade();

  return (
    <MainLayout>
      <TopBar
        workspace={workspace}
        contractVersions={contractVersions}
        attachedProcess={processSession ? `${processSession.processName} (${processSession.pid})` : null}
        onOpenSelector={openSelector}
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

      <StatusBar workspace={workspace} />
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
