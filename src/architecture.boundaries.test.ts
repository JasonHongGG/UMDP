import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');
const ALLOWED_TAURI_IMPORT_PREFIXES = [
  'infrastructure/tauri/',
];
const STUDIO_ENGINE_PROTECTED_PREFIXES = [
  'domain/studio/kernel/',
  'features/studio/application/engine/',
];
const STUDIO_CORE_PREFIX = 'features/studio/core/';
const STUDIO_COMPONENTS_PREFIX = 'features/studio/components/';
const STUDIO_NODES_PREFIX = 'features/studio/nodes/';
const INSPECTOR_COMPONENTS_PREFIX = 'features/inspector/components/';
const APP_SHELL_PREFIX = 'app/shell/';
const SHARED_UI_PREFIX = 'shared/ui/';
const LEGACY_FRONTEND_BUCKETS = [
  'components',
  'nodes',
  'app/pages',
  'application/studio',
  'core/studio',
];

function containsImport(contents: string, specifier: string): boolean {
  return contents.includes(`'${specifier}'`) || contents.includes(`"${specifier}"`);
}

function importsStudioContextDirectly(contents: string): boolean {
  return containsImport(contents, '@/features/studio/application/StudioModuleContext')
    || contents.includes('/features/studio/application/StudioModuleContext\'')
    || contents.includes('/features/studio/application/StudioModuleContext"');
}

function importsStudioRuntimeDataDirectly(contents: string): boolean {
  return containsImport(contents, '@/features/studio/core/runtimeData')
    || contents.includes('/features/studio/core/runtimeData\'')
    || contents.includes('/features/studio/core/runtimeData"');
}

function importsStudioExpressionDragDirectly(contents: string): boolean {
  return containsImport(contents, '@/features/studio/core/drag/ExpressionDragContext')
    || contents.includes('/features/studio/core/drag/ExpressionDragContext\'')
    || contents.includes('/features/studio/core/drag/ExpressionDragContext"');
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry: string) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
      return [];
    }

    if (fullPath.includes('.test.')) {
      return [];
    }

    return [fullPath];
  });
}

function listViolations(predicate: (relativePath: string, contents: string) => boolean): string[] {
  return collectSourceFiles(SRC_ROOT)
    .map((filePath) => ({
      relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
      contents: readFileSync(filePath, 'utf8'),
    }))
    .filter(({ relativePath, contents }) => predicate(relativePath, contents))
    .map(({ relativePath }) => relativePath);
}

describe('frontend architecture boundaries', () => {
  it('does not import Tauri APIs outside infrastructure adapters', () => {
    const violations = listViolations((relativePath, contents) => {
      if (ALLOWED_TAURI_IMPORT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
        return false;
      }

      return contents.includes('@tauri-apps/api/');
    });

    expect(violations).toEqual([]);
  });

  it('removes legacy frontend bucket directories', () => {
    const existing = LEGACY_FRONTEND_BUCKETS.filter((bucket) => existsSync(join(SRC_ROOT, bucket)));
    expect(existing).toEqual([]);
  });

  it('does not allow the studio engine subtrees to import infrastructure directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!STUDIO_ENGINE_PROTECTED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
        return false;
      }

      return /from\s+['"].*infrastructure\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow studio graphStore to import infrastructure directly', () => {
    const graphStorePath = join(SRC_ROOT, 'features', 'studio', 'core', 'graphStore.ts');
    const contents = readFileSync(graphStorePath, 'utf8');

    expect(/from\s+['"].*infrastructure\//.test(contents)).toBe(false);
  });

  it('does not allow studio nodes to import infrastructure directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(STUDIO_NODES_PREFIX)) {
        return false;
      }

      return /from\s+['"].*infrastructure\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow feature components to import StudioContext directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(INSPECTOR_COMPONENTS_PREFIX) && !relativePath.startsWith(STUDIO_COMPONENTS_PREFIX)) {
        return false;
      }

      return importsStudioContextDirectly(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow studio nodes to import StudioContext directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(STUDIO_NODES_PREFIX)) {
        return false;
      }

      return importsStudioContextDirectly(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow studio components or nodes to import runtimeData or ExpressionDragContext directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(STUDIO_COMPONENTS_PREFIX) && !relativePath.startsWith(STUDIO_NODES_PREFIX)) {
        return false;
      }

      return importsStudioRuntimeDataDirectly(contents) || importsStudioExpressionDragDirectly(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow shared ui to import feature internals', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(SHARED_UI_PREFIX)) {
        return false;
      }

      return contents.includes('@/features/') || /from\s+['"].*features\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow domain modules to import feature internals', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith('domain/')) {
        return false;
      }

      return contents.includes('@/features/') || /from\s+['"].*features\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow app shell to import feature internals', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(APP_SHELL_PREFIX)) {
        return false;
      }

      return contents.includes('@/features/') || /from\s+['"].*features\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('does not allow domain adapter hooks to construct infrastructure adapters directly', () => {
    const files = [
      'domain/analysis/hooks/useAnalysisRepository.ts',
      'domain/scene/hooks/useSceneGateway.ts',
    ];

    const violations = files.filter((relativePath) => {
      const contents = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
      return /from\s+['"].*infrastructure\/tauri\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('keeps scene workspace composition separate from tauri event subscriptions', () => {
    const contents = readFileSync(join(SRC_ROOT, 'features/scene/page/useSceneWorkspaceState.ts'), 'utf8');

    expect(contents.includes('@/infrastructure/tauri/TauriSceneEvents')).toBe(false);
  });

  it('keeps the scene workspace provider scoped to the scene page', () => {
    const appContents = readFileSync(join(SRC_ROOT, 'App.tsx'), 'utf8');
    const scenePageContents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'ScenePage.tsx'), 'utf8');

    expect(appContents.includes('SceneWorkspaceProvider')).toBe(false);
    expect(scenePageContents.includes('SceneWorkspaceProvider')).toBe(true);
  });

  it('does not expose a monolithic scene workspace context bag', () => {
    const contextContents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'SceneWorkspaceContext.tsx'), 'utf8');
    const inspectorContents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'components', 'SceneInspectorView.tsx'), 'utf8');

    expect(contextContents.includes('createContext<SceneWorkspaceStateResult | null>')).toBe(false);
    expect(contextContents.includes('export function useSceneWorkspace(')).toBe(false);
    expect(inspectorContents.includes('useSceneWorkspace')).toBe(false);
  });

  it('keeps scene mouse picker state owned by the scene workspace store', () => {
    const pickerContents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'useSceneMousePickerState.ts'), 'utf8');

    expect(pickerContents.includes('useState(')).toBe(false);
  });

  it('does not allow scene hierarchy panel to keep a local fallback search state', () => {
    const contents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'components', 'SceneHierarchyPanel.tsx'), 'utf8');

    expect(contents.includes('fallbackSearchQuery')).toBe(false);
    expect(contents.includes('setFallbackSearchQuery')).toBe(false);
  });

  it('keeps scene workspace persistence behind an explicit adapter', () => {
    const contents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'useSceneWorkspaceStore.ts'), 'utf8');

    expect(contents.includes('sessionStorage')).toBe(false);
    expect(contents.includes("./sceneWorkspacePersistence")).toBe(true);
  });

  it('keeps studio handoff state out of the analysis workspace slice', () => {
    const analysisSliceContents = readFileSync(join(SRC_ROOT, 'app/state/analysisSlice.ts'), 'utf8');
    const analysisHookContents = readFileSync(join(SRC_ROOT, 'app/state/useAnalysisWorkspace.ts'), 'utf8');
    const handoffHookContents = readFileSync(join(SRC_ROOT, 'app/state/useStudioHandoff.ts'), 'utf8');

    expect(analysisSliceContents.includes('pendingClassNode')).toBe(false);
    expect(analysisHookContents.includes('queuePendingClassNode')).toBe(false);
    expect(analysisHookContents.includes('clearPendingClassNode')).toBe(false);
    expect(handoffHookContents.includes('queuePendingClassNode')).toBe(true);
  });

  it('keeps studio degraded state explicitly surfaced at the page shell', () => {
    const contents = readFileSync(join(SRC_ROOT, 'features', 'studio', 'page', 'StudioPage.tsx'), 'utf8');

    expect(contents.includes("detail.systemState === 'runtime-degraded'")).toBe(true);
  });

  it('does not allow the studio application layer to reintroduce a single service bag context', () => {
    const contents = readFileSync(join(SRC_ROOT, 'features', 'studio', 'application', 'StudioModuleContext.tsx'), 'utf8');

    expect(contents.includes('interface StudioServices')).toBe(false);
    expect(contents.includes('useStudioServices')).toBe(false);
    expect(existsSync(join(SRC_ROOT, 'features', 'studio', 'application', 'StudioServicesContext.tsx'))).toBe(false);
    expect(contents.includes('StudioGraphContext')).toBe(true);
    expect(contents.includes('StudioUiContext')).toBe(true);
    expect(contents.includes('StudioRuntimeContext')).toBe(true);
    expect(contents.includes('StudioQueryContext')).toBe(true);
  });

  it('removes the legacy studio application kernel directory', () => {
    expect(existsSync(join(SRC_ROOT, 'features', 'studio', 'application', 'kernel'))).toBe(false);
    expect(existsSync(join(SRC_ROOT, 'features', 'studio', 'application', 'engine'))).toBe(true);
  });

  it('removes legacy shared workspace context and composition files', () => {
    const legacyFiles = [
      'domain/analysis/AnalysisWorkspaceContext.tsx',
      'domain/analysis/AnalysisWorkspaceContext.types.ts',
      'domain/analysis/composition/useAnalysisWorkspaceModel.ts',
      'domain/analysis/hooks/useAnalysisRuntimeState.ts',
      'domain/analysis/hooks/useAnalysisSessionState.ts',
      'domain/analysis/hooks/useWorkspaceLifecycleAutoRefresh.ts',
      'domain/analysis/hooks/useWorkspaceLifecycleState.ts',
      'domain/inspector/InspectorWorkspaceContext.tsx',
      'domain/inspector/InspectorWorkspaceValue.ts',
      'domain/inspector/useInspectorWorkspaceValue.ts',
      'domain/workspace/WorkspaceShellContext.tsx',
      'domain/workspace/useWorkspaceShellModel.ts',
      'features/studio/core/StudioContext.tsx',
      'features/studio/application/StudioComposition.ts',
    ].filter((relativePath) => existsSync(join(SRC_ROOT, relativePath)));

    expect(legacyFiles).toEqual([]);
  });

  it('keeps app state orchestration separated between store reducers and lifecycle event wiring', () => {
    const providerContents = readFileSync(join(SRC_ROOT, 'app/state/AppStateProvider.tsx'), 'utf8');
    const storeContents = readFileSync(join(SRC_ROOT, 'app/state/store.ts'), 'utf8');
    const workspaceSliceContents = readFileSync(join(SRC_ROOT, 'app/state/workspaceSlice.ts'), 'utf8');

    expect(providerContents.includes('@/features/')).toBe(false);
    expect(providerContents.includes('@/domain/analysis/view-models')).toBe(false);
    expect(storeContents.includes('createSlice(')).toBe(false);
    expect(storeContents.includes("window.addEventListener('focus'")).toBe(false);
    expect(storeContents.includes("document.addEventListener('visibilitychange'")).toBe(false);
    expect(storeContents.includes('workspaceActions.applyLifecycleFallback')).toBe(false);
    expect(workspaceSliceContents.includes('applyLifecycleFallback')).toBe(false);
  });

  it('does not allow deprecated frontend workspace kernel imports', () => {
    const violations = listViolations((_relativePath, contents) => {
      return contents.includes('@/kernel/workspace/') || /from\s+['"].*kernel\/workspace\//.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('keeps studio core isolated under the feature slice', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!relativePath.startsWith(STUDIO_CORE_PREFIX)) {
        return false;
      }

      return /from\s+['"].*app\/shell\//.test(contents);
    });

    expect(violations).toEqual([]);
  });
});
