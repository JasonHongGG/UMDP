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
    expect(existsSync(join(RUST_SRC_ROOT, 'state', 'analysis_store.rs'))).toBe(false);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'metadata', 'mod.rs'))).toBe(true);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'metadata', 'access.rs'))).toBe(true);

    const kernelMod = readRustFile('kernel', 'mod.rs');
    const workspaceMod = readRustFile('kernel', 'workspace', 'mod.rs');
    const stateMod = readRustFile('state', 'mod.rs');

    expect(kernelMod).toContain('pub mod metadata;');
    expect(workspaceMod).toContain('pub mod access;');
    expect(stateMod.includes('analysis_store')).toBe(false);
    expect(stateMod.includes('analysis(')).toBe(false);
  });

  it('removes the legacy services layer and rehomes workspace concerns into kernel or infrastructure modules', () => {
    const libContents = readRustFile('lib.rs');
    const workspaceApplication = readRustFile('application', 'workspace.rs');
    const metadataMod = readRustFile('kernel', 'metadata', 'mod.rs');
    const workspaceMod = readRustFile('kernel', 'workspace', 'mod.rs');

    expect(libContents.includes('mod services;')).toBe(false);
    expect(workspaceApplication.includes('crate::services::')).toBe(false);
    expect(existsSync(join(RUST_SRC_ROOT, 'services'))).toBe(false);
    expect(existsSync(join(RUST_SRC_ROOT, 'infrastructure', 'process_catalog.rs'))).toBe(true);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'metadata', 'query.rs'))).toBe(true);
    expect(existsSync(join(RUST_SRC_ROOT, 'kernel', 'workspace', 'session.rs'))).toBe(true);
    expect(metadataMod).toContain('pub mod query;');
    expect(workspaceMod).toContain('pub mod session;');
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

  it('keeps workspace lifecycle transitions behind explicit state transition APIs', () => {
    const stateMod = readRustFile('state', 'mod.rs');
    const workspaceStore = readRustFile('state', 'workspace_store.rs');
    const workspaceAccess = readRustFile('kernel', 'workspace', 'access.rs');
    const runtimeAccess = readRustFile('kernel', 'runtime', 'access.rs');
    const workspaceKernel = readRustFile('kernel', 'workspace', 'mod.rs');
    const workspaceSession = readRustFile('kernel', 'workspace', 'session.rs');
    const sceneCommon = readRustFile('kernel', 'scene', 'common.rs');
    const sceneMutation = readRustFile('kernel', 'scene', 'mutation.rs');
    const metadataAccess = readRustFile('kernel', 'metadata', 'access.rs');
    const metadataQuery = readRustFile('kernel', 'metadata', 'query.rs');

    expect(stateMod).toContain('pub fn begin_attach(&self)');
    expect(stateMod).toContain('pub fn current_with_runtime_projection(&self) -> WorkspaceLifecycleState');
    expect(stateMod).toContain('pub fn with_scene_mutation_lock<T>(&self, execute: impl FnOnce() -> T) -> T');
    expect(workspaceStore).toContain('enum WorkspaceLifecycleTransition');
    expect(workspaceStore.includes('pub fn set_attaching')).toBe(false);
    expect(workspaceStore.includes('pub fn set_snapshot_loading')).toBe(false);
    expect(workspaceStore.includes('pub fn set_ready')).toBe(false);
    expect(workspaceStore.includes('pub fn set_runtime_error')).toBe(false);
    expect(runtimeAccess.includes('apply_runtime_session_profile')).toBe(false);
    expect(runtimeAccess.includes('refresh_runtime_session_profile')).toBe(true);
    expect(runtimeAccess.includes('.workspace().lifecycle().')).toBe(false);
    expect(workspaceAccess.includes('.workspace().lifecycle().')).toBe(false);
    expect(workspaceSession.includes('.workspace().lifecycle().')).toBe(false);
    expect(workspaceKernel.includes('.workspace().lifecycle().')).toBe(false);
    expect(sceneCommon.includes('.workspace().lifecycle().')).toBe(false);
    expect(sceneMutation.includes('.workspace().lifecycle().')).toBe(false);
    expect(metadataAccess.includes('.workspace().lifecycle().')).toBe(false);
    expect(metadataQuery.includes('.workspace().lifecycle().')).toBe(false);
    expect(workspaceKernel.includes('.set_attached_without_snapshot(')).toBe(false);
    expect(workspaceKernel.includes('state.workspace().complete_attach(')).toBe(true);
  });

  it('keeps scene reset orchestration behind scene module aggregate helpers', () => {
    const stateMod = readRustFile('state', 'mod.rs');
    const workspaceKernel = readRustFile('kernel', 'workspace', 'mod.rs');
    const sceneRefresh = readRustFile('kernel', 'scene', 'refresh.rs');

    expect(stateMod).toContain('pub fn reset_query_state(&self)');
    expect(stateMod).toContain('pub fn reset_runtime_state(&self)');
    expect(workspaceKernel).toContain('state.scene().reset_runtime_state();');
    expect(workspaceKernel.includes('state.scene().children().reset();')).toBe(false);
    expect(workspaceKernel.includes('state.scene().header().reset();')).toBe(false);
    expect(workspaceKernel.includes('state.scene().components().reset();')).toBe(false);
    expect(workspaceKernel.includes('state.scene().picker().reset();')).toBe(false);
    expect(sceneRefresh.includes('state.scene().children().reset();')).toBe(false);
    expect(sceneRefresh.includes('state.scene().header().reset();')).toBe(false);
    expect(sceneRefresh.includes('state.scene().components().reset();')).toBe(false);
  });

  it('keeps scene catalog lifecycle transitions behind scene module aggregate helpers', () => {
    const stateMod = readRustFile('state', 'mod.rs');
    const sceneRefresh = readRustFile('kernel', 'scene', 'refresh.rs');
    const sceneMutation = readRustFile('kernel', 'scene', 'mutation.rs');
    const sceneApplication = readRustFile('application', 'scene.rs');

    expect(stateMod).toContain('pub fn current_workspace(&self, session_key: Option<&str>) -> SceneWorkspaceState');
    expect(stateMod).toContain('pub fn begin_refresh(&self, session_key: Option<String>) -> SceneWorkspaceState');
    expect(stateMod).toContain('pub fn complete_refresh(');
    expect(stateMod).toContain('pub fn fail_refresh(');
    expect(stateMod).toContain('pub fn mark_mutation_epoch(&self, session_key: Option<&str>) -> SceneWorkspaceState');
    expect(sceneRefresh.includes('.scene().workspace().set_refreshing')).toBe(false);
    expect(sceneRefresh.includes('.scene().workspace().set_error')).toBe(false);
    expect(sceneRefresh.includes('.scene().workspace().set_snapshot')).toBe(false);
    expect(sceneMutation.includes('.scene().workspace().bump_mutation_epoch')).toBe(false);
    expect(sceneApplication.includes('.scene().workspace().current_for')).toBe(false);
    expect(sceneApplication.includes('state.scene().current_workspace(')).toBe(true);
    expect(sceneApplication.includes('workspace_kernel::current_lifecycle(state)')).toBe(true);
    expect(sceneApplication.includes('.workspace().lifecycle().current()')).toBe(false);
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