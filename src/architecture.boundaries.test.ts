import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');
const ALLOWED_TAURI_IMPORT_PREFIXES = [
  'infrastructure/tauri/',
];
const STUDIO_KERNEL_PROTECTED_PREFIXES = [
  'domain/studio/kernel/',
  'features/studio/application/kernel/',
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
  return containsImport(contents, '@/features/studio/application/StudioServicesContext')
    || contents.includes('/features/studio/application/StudioServicesContext\'')
    || contents.includes('/features/studio/application/StudioServicesContext"');
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

  it('does not allow the studio kernel subtrees to import infrastructure directly', () => {
    const violations = listViolations((relativePath, contents) => {
      if (!STUDIO_KERNEL_PROTECTED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
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

  it('keeps scene mouse picker state owned by the scene workspace store', () => {
    const pickerContents = readFileSync(join(SRC_ROOT, 'features', 'scene', 'page', 'useSceneMousePickerState.ts'), 'utf8');

    expect(pickerContents.includes('useState(')).toBe(false);
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

    expect(providerContents.includes('@/features/')).toBe(false);
    expect(providerContents.includes('@/domain/analysis/view-models')).toBe(false);
    expect(storeContents.includes('createSlice(')).toBe(false);
    expect(storeContents.includes("window.addEventListener('focus'")).toBe(false);
    expect(storeContents.includes("document.addEventListener('visibilitychange'")).toBe(false);
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
