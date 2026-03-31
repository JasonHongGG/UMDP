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
  return containsImport(contents, '@/features/studio/core/StudioContext')
    || contents.includes('/features/studio/core/StudioContext\'')
    || contents.includes('/features/studio/core/StudioContext"');
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

  it('keeps analysis workspace provider as a composition shell instead of owning session and catalog logic directly', () => {
    const contents = readFileSync(join(SRC_ROOT, 'domain/analysis/AnalysisWorkspaceContext.tsx'), 'utf8');

    expect(contents.includes('./hooks/useAnalysisSessionState')).toBe(false);
    expect(contents.includes('./hooks/useAnalysisRuntimeState')).toBe(false);
    expect(contents.includes('./view-models')).toBe(false);
  });

  it('keeps analysis session attach flow separate from workspace lifecycle refresh listeners', () => {
    const contents = readFileSync(join(SRC_ROOT, 'domain/analysis/hooks/useAnalysisSessionState.ts'), 'utf8');

    expect(contents.includes('repository.getWorkspaceLifecycle')).toBe(false);
    expect(contents.includes("window.addEventListener('focus'")).toBe(false);
    expect(contents.includes("document.addEventListener('visibilitychange'")).toBe(false);
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
