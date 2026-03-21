
import { MainLayout } from './components/layout/MainLayout';
import { TopBar } from './components/features/TopBar';
import { StudioPage } from './components/features/StudioPage';
import { AnalysisWorkspaceProvider, useAnalysisWorkspace } from './domain/analysis/AnalysisWorkspaceContext';
import { InspectorPage } from './app/pages/InspectorPage';
import { StatusBar } from './app/shell/StatusBar';
import { useWorkspaceShellFacade } from './app/facades/useWorkspaceShellFacade';
import './styles.css';

export default function App() {
  return (
    <AnalysisWorkspaceProvider>
      <AppContent />
    </AnalysisWorkspaceProvider>
  );
}

function AppContent() {
  const { workspace, processSession, activePage, setActivePage, openSelector } = useWorkspaceShellFacade();

  return (
    <MainLayout>
      <TopBar
        workspace={workspace}
        attachedProcess={processSession ? `${processSession.processName} (${processSession.pid})` : null}
        onOpenSelector={openSelector}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      {activePage === 'inspector' ? (
        <InspectorPage />
      ) : (
        <StudioPage />
      )}

      <StatusBar workspace={workspace} />
    </MainLayout>
  );
}
