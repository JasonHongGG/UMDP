import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const RUST_SRC_ROOT = join(REPO_ROOT, 'src-tauri', 'src');
const COMMANDS_ROOT = join(RUST_SRC_ROOT, 'commands');
const APPLICATION_ROOT = join(RUST_SRC_ROOT, 'application');

function readRustFile(...segments: string[]) {
  return readFileSync(join(RUST_SRC_ROOT, ...segments), 'utf8');
}

describe('backend architecture boundaries', () => {
  it('does not allow tauri commands to import analysis services directly', () => {
    const commandFiles = readdirSync(COMMANDS_ROOT)
      .filter((entry) => entry.endsWith('.rs'));

    const violations = commandFiles.filter((entry) => {
      const contents = readFileSync(join(COMMANDS_ROOT, entry), 'utf8');
      return contents.includes('crate::services::analysis');
    });

    expect(violations).toEqual([]);
  });

  it('keeps command entrypoints routed through application modules for workspace, metadata, runtime, and scene', () => {
    const requiredMappings = [
      ['commands/process.rs', /crate::application::workspace/],
      ['commands/metadata.rs', /crate::application::\{[^}]*metadata[^}]*workspace[^}]*\}|crate::application::\{[^}]*workspace[^}]*metadata[^}]*\}/],
      ['commands/invocation.rs', /crate::application::runtime_execution/],
      ['commands/field_setting.rs', /crate::application::runtime_execution/],
      ['commands/scene.rs', /crate::application::scene/],
    ] as const;

    const violations = requiredMappings.filter(([relativePath, expectedImport]) => {
      const contents = readRustFile(...relativePath.split('/'));
      return !expectedImport.test(contents);
    }).map(([relativePath, expectedImport]) => `${relativePath} -> ${expectedImport}`);

    expect(violations).toEqual([]);
  });

  it('keeps the scene service monolith removed and split modules present', () => {
    expect(existsSync(join(RUST_SRC_ROOT, 'services', 'analysis', 'scene_service.rs'))).toBe(false);

    const requiredSceneModules = [
      'mod.rs',
      'events.rs',
      'mapping.rs',
      'mutation.rs',
      'query.rs',
      'tasks.rs',
    ];

    const missing = requiredSceneModules.filter((fileName) => {
      return !existsSync(join(RUST_SRC_ROOT, 'services', 'analysis', 'scene', fileName));
    });

    expect(missing).toEqual([]);
  });

  it('does not allow legacy analysis contract aliases in rust domain models', () => {
    const contents = readRustFile('domain', 'analysis_models.rs');

    expect(contents.includes('legacyImageId')).toBe(false);
    expect(contents.includes('#[serde(alias =')).toBe(false);
  });

  it('keeps application boundary modules declared from the rust application root', () => {
    const contents = readFileSync(join(APPLICATION_ROOT, 'mod.rs'), 'utf8');

    expect(contents).toContain('pub mod workspace;');
    expect(contents).toContain('pub mod metadata;');
    expect(contents).toContain('pub mod runtime_execution;');
    expect(contents).toContain('pub mod scene;');
  });
});