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

  it('keeps scene orchestration owned by kernel modules', () => {
    expect(existsSync(join(RUST_SRC_ROOT, 'services', 'analysis', 'scene_service.rs'))).toBe(false);
    expect(existsSync(join(RUST_SRC_ROOT, 'services', 'analysis', 'scene'))).toBe(false);

    const requiredSceneModules = [
      'mod.rs',
      'common.rs',
      'events.rs',
      'mutation.rs',
      'refresh.rs',
      'tasks.rs',
    ];

    const requiredSceneQueryModules = [
      'mod.rs',
      'entrypoints.rs',
      'catalog.rs',
      'mutation.rs',
      'runtime.rs',
      'projection.rs',
      'helpers.rs',
      'tests.rs',
    ];

    const missing = requiredSceneModules.filter((fileName) => {
      return !existsSync(join(RUST_SRC_ROOT, 'kernel', 'scene', fileName));
    });

    const missingQueryModules = requiredSceneQueryModules.filter((fileName) => {
      return !existsSync(join(RUST_SRC_ROOT, 'kernel', 'scene', 'query', fileName));
    });

    expect(missing).toEqual([]);
    expect(missingQueryModules).toEqual([]);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'scene', 'query.rs'))).toBe(false);
  });

  it('keeps runtime and metadata access owned by kernel access modules', () => {
    expect(existsSync(join(RUST_SRC_ROOT, 'services', 'analysis', 'runtime_session_service.rs'))).toBe(false);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'metadata', 'mod.rs'))).toBe(true);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'metadata', 'access.rs'))).toBe(true);

    const kernelMod = readRustFile('kernel', 'mod.rs');
    const workspaceMod = readRustFile('kernel', 'workspace', 'mod.rs');

    expect(kernelMod).toContain('pub mod metadata;');
    expect(workspaceMod).toContain('pub mod access;');
  });

  it('keeps runtime invoke, field-set, and overlay orchestration out of analysis services', () => {
    const removedServiceFiles = [
      'services/analysis/invocation_service.rs',
      'services/analysis/field_setting_service.rs',
      'services/analysis/runtime_overlay_service.rs',
    ];

    const missing = removedServiceFiles.filter((relativePath) => existsSync(join(RUST_SRC_ROOT, ...relativePath.split('/'))));

    expect(missing).toEqual([]);

    const runtimeExecution = readRustFile('application', 'runtime_execution.rs');
    const metadata = readRustFile('application', 'metadata.rs');

    expect(runtimeExecution).toContain('crate::kernel::runtime::invoke as native_invoke');
    expect(runtimeExecution).toContain('crate::kernel::runtime::field_set as native_field_set');
    expect(metadata).toContain('crate::kernel::runtime::overlay as native_overlay');
  });

  it('keeps application workspace, metadata, and scene errors typed until the command boundary', () => {
    const files = ['application/workspace.rs', 'application/metadata.rs', 'application/scene.rs'];

    const violations = files.filter((relativePath) => {
      const contents = readRustFile(...relativePath.split('/'));
      return /Result<[^\n>]+,\s*String>/.test(contents);
    });

    expect(violations).toEqual([]);
  });

  it('keeps attach and snapshot workflow transitions owned by kernel workspace helpers', () => {
    const contents = readRustFile('application', 'workspace.rs');
    const productionSection = contents.split('#[cfg(test)]')[0] ?? contents;

    expect(productionSection).toContain('workspace_kernel::complete_attach_with_runtime_refresh');
    expect(productionSection).toContain('workspace_kernel::run_snapshot_load');
    expect(productionSection).not.toContain('workspace_kernel::finish_attach(');
    expect(productionSection).not.toContain('workspace_kernel::begin_snapshot_load(');
    expect(productionSection).not.toContain('workspace_kernel::fail_snapshot_load(');
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