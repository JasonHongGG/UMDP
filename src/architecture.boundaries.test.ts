import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');
const ALLOWED_TAURI_IMPORT_PREFIXES = [
  'infrastructure/tauri/',
];
const STUDIO_KERNEL_PROTECTED_PREFIXES = [
  'domain/studio/kernel/',
  'application/studio/kernel/',
];
const NODES_PROTECTED_PREFIX = 'nodes/';
const FEATURES_PROTECTED_PREFIX = 'components/features/';
const STUDIO_COMPONENTS_PROTECTED_PREFIX = 'components/studio/';

function importsStudioContextDirectly(contents: string): boolean {
  return contents.includes("/core/studio/StudioContext'")
    || contents.includes('/core/studio/StudioContext"');
}

function importsStudioRuntimeDataDirectly(contents: string): boolean {
  return contents.includes("/core/studio/runtimeData'")
    || contents.includes('/core/studio/runtimeData"');
}

function importsStudioExpressionDragDirectly(contents: string): boolean {
  return contents.includes("/core/studio/drag/ExpressionDragContext'")
    || contents.includes('/core/studio/drag/ExpressionDragContext"');
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

describe('frontend architecture boundaries', () => {
  it('does not import Tauri APIs outside infrastructure adapters', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (ALLOWED_TAURI_IMPORT_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
          return false;
        }

        return contents.includes("@tauri-apps/api/");
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow the new studio kernel subtree to import infrastructure directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!STUDIO_KERNEL_PROTECTED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
          return false;
        }

        return /from\s+['"].*infrastructure\//.test(contents) || /from\s+['"]\.\.\/.*infrastructure\//.test(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow graphStore to import infrastructure directly', () => {
    const graphStorePath = join(SRC_ROOT, 'core', 'studio', 'graphStore.ts');
    const contents = readFileSync(graphStorePath, 'utf8');

    expect(/from\s+['"].*infrastructure\//.test(contents)).toBe(false);
  });

  it('does not allow studio nodes to import infrastructure directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(NODES_PROTECTED_PREFIX)) {
          return false;
        }

        return /from\s+['"].*infrastructure\//.test(contents) || /from\s+['"]\.\.\/.*infrastructure\//.test(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow feature components to import StudioContext directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(FEATURES_PROTECTED_PREFIX)) {
          return false;
        }

        return importsStudioContextDirectly(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow studio components to import StudioContext directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(STUDIO_COMPONENTS_PROTECTED_PREFIX)) {
          return false;
        }

        return importsStudioContextDirectly(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow studio nodes to import StudioContext directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(NODES_PROTECTED_PREFIX)) {
          return false;
        }

        return importsStudioContextDirectly(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow studio components to import runtimeData or ExpressionDragContext directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(STUDIO_COMPONENTS_PROTECTED_PREFIX)) {
          return false;
        }

        return importsStudioRuntimeDataDirectly(contents) || importsStudioExpressionDragDirectly(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not allow studio nodes to import runtimeData or ExpressionDragContext directly', () => {
    const violations = collectSourceFiles(SRC_ROOT)
      .map((filePath) => ({
        filePath,
        relativePath: relative(SRC_ROOT, filePath).replace(/\\/g, '/'),
        contents: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ relativePath, contents }) => {
        if (!relativePath.startsWith(NODES_PROTECTED_PREFIX)) {
          return false;
        }

        return importsStudioRuntimeDataDirectly(contents) || importsStudioExpressionDragDirectly(contents);
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });
});