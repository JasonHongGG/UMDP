import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');
const ALLOWED_TAURI_IMPORT_PREFIXES = [
  'infrastructure/tauri/',
];

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
});