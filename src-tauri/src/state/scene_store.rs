use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenTaskStatus,
    RuntimeSceneComponentSummary, RuntimeSceneMousePickerSnapshot,
    RuntimeSceneMousePickerStatus, RuntimeSceneMouseTargetHit,
    RuntimeSceneNodeSummary, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectComponentsTaskState, RuntimeSceneObjectComponentsTaskStatus,
    RuntimeSceneObjectHeaderTaskState, RuntimeSceneObjectHeaderTaskStatus,
    RuntimeSceneObjectInspectorHeaderSnapshot, RuntimeSceneResourceKind,
    RuntimeSceneResourceState, RuntimeScreenPoint, SceneRefreshStatus,
    SceneResourceFreshness, SceneWorkspaceState,
};
use crate::infrastructure::clock::current_timestamp;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

fn same_session_key(left: Option<&str>, right: Option<&str>) -> bool {
    left == right
}

fn bump_scene_workspace_revision(workspace: &mut SceneWorkspaceState) {
    workspace.resource_revision += 1;
}

fn bump_children_revision(store: &mut SceneChildrenStore) -> u64 {
    store.resource_revision += 1;
    store.resource_revision
}

fn bump_header_revision(store: &mut SceneObjectHeaderStore) -> u64 {
    store.resource_revision += 1;
    store.resource_revision
}

fn bump_components_revision(store: &mut SceneObjectComponentsStore) -> u64 {
    store.resource_revision += 1;
    store.resource_revision
}

fn default_scene_workspace(session_key: Option<&str>) -> SceneWorkspaceState {
    SceneWorkspaceState {
        session_key: session_key.map(str::to_owned),
        resource_state: create_scene_resource_state(RuntimeSceneResourceKind::Catalog, session_key),
        ..SceneWorkspaceState::default()
    }
}

fn create_scene_resource_state(
    resource_kind: RuntimeSceneResourceKind,
    session_key: Option<&str>,
) -> RuntimeSceneResourceState {
    RuntimeSceneResourceState {
        resource_kind,
        session_key: session_key.map(str::to_owned),
        ..RuntimeSceneResourceState::default()
    }
}

fn patch_resource_state(
    resource_state: &mut RuntimeSceneResourceState,
    resource_kind: RuntimeSceneResourceKind,
    resource_revision: u64,
    session_key: Option<&str>,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    resource_state.resource_kind = resource_kind;
    resource_state.resource_revision = resource_revision;
    resource_state.session_key = session_key.map(str::to_owned);
    resource_state.freshness = freshness;
    resource_state.last_successful_at = last_successful_at;
    resource_state.is_retaining_snapshot = is_retaining_snapshot;
    resource_state.error_message = error_message;
}

fn patch_workspace_resource_state(
    workspace: &mut SceneWorkspaceState,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    let session_key = workspace.session_key.clone();
    patch_resource_state(
        &mut workspace.resource_state,
        RuntimeSceneResourceKind::Catalog,
        workspace.resource_revision,
        session_key.as_deref(),
        freshness,
        last_successful_at,
        is_retaining_snapshot,
        error_message,
    );
}

fn patch_children_task_resource_state(
    task: &mut RuntimeSceneObjectChildrenTaskState,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    let session_key = task.session_key.clone();
    patch_resource_state(
        &mut task.resource_state,
        RuntimeSceneResourceKind::Children,
        task.resource_revision,
        session_key.as_deref(),
        freshness,
        last_successful_at,
        is_retaining_snapshot,
        error_message,
    );
}

fn patch_header_task_resource_state(
    task: &mut RuntimeSceneObjectHeaderTaskState,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    let session_key = task.session_key.clone();
    patch_resource_state(
        &mut task.resource_state,
        RuntimeSceneResourceKind::SceneObjectHeader,
        task.resource_revision,
        session_key.as_deref(),
        freshness,
        last_successful_at,
        is_retaining_snapshot,
        error_message,
    );
}

fn patch_components_task_resource_state(
    task: &mut RuntimeSceneObjectComponentsTaskState,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    let session_key = task.session_key.clone();
    patch_resource_state(
        &mut task.resource_state,
        RuntimeSceneResourceKind::SceneObjectComponents,
        task.resource_revision,
        session_key.as_deref(),
        freshness,
        last_successful_at,
        is_retaining_snapshot,
        error_message,
    );
}

fn task_has_retained_children(task: &RuntimeSceneObjectChildrenTaskState) -> bool {
    !task.children.is_empty()
}

fn task_has_retained_header(task: &RuntimeSceneObjectHeaderTaskState) -> bool {
    task.header.is_some()
}

fn task_has_retained_components(task: &RuntimeSceneObjectComponentsTaskState) -> bool {
    !task.components.is_empty() || task.resource_state.last_successful_at.is_some()
}

#[derive(Default)]
pub struct SceneState {
    workspace: Mutex<SceneWorkspaceState>,
}

impl SceneState {
    pub fn current_for(&self, session_key: Option<&str>) -> SceneWorkspaceState {
        let workspace = self.workspace.lock().clone();
        if same_session_key(workspace.session_key.as_deref(), session_key) {
            workspace
        } else {
            default_scene_workspace(session_key)
        }
    }

    pub fn set_refreshing(&self, session_key: Option<String>) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        if !same_session_key(workspace.session_key.as_deref(), session_key.as_deref()) {
            *workspace = default_scene_workspace(session_key.as_deref());
        }
        let last_successful_at = workspace.resource_state.last_successful_at.clone();
        let is_retaining_snapshot = workspace.snapshot.is_some();
        workspace.session_key = session_key;
        workspace.refresh_status = SceneRefreshStatus::Refreshing;
        workspace.error_message = None;
        bump_scene_workspace_revision(&mut workspace);
        patch_workspace_resource_state(
            &mut workspace,
            SceneResourceFreshness::Refreshing,
            last_successful_at,
            is_retaining_snapshot,
            None,
        );
        workspace.clone()
    }

    pub fn set_snapshot(
        &self,
        session_key: Option<&str>,
        snapshot: RuntimeSceneCatalogSnapshot,
    ) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        if !same_session_key(workspace.session_key.as_deref(), session_key) {
            return workspace.clone();
        }
        let last_successful_at = Some(snapshot.generated_at.clone());
        workspace.refresh_status = SceneRefreshStatus::Ready;
        workspace.error_message = None;
        workspace.last_updated_at = Some(snapshot.generated_at.clone());
        workspace.snapshot = Some(snapshot);
        bump_scene_workspace_revision(&mut workspace);
        patch_workspace_resource_state(
            &mut workspace,
            SceneResourceFreshness::Fresh,
            last_successful_at,
            true,
            None,
        );
        workspace.clone()
    }

    pub fn set_error(
        &self,
        session_key: Option<&str>,
        error: impl Into<String>,
    ) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        if !same_session_key(workspace.session_key.as_deref(), session_key) {
            return workspace.clone();
        }
        let error = error.into();
        let has_snapshot = workspace.snapshot.is_some();
        let last_successful_at = workspace.resource_state.last_successful_at.clone();
        workspace.refresh_status = SceneRefreshStatus::Error;
        workspace.error_message = Some(error.clone());
        bump_scene_workspace_revision(&mut workspace);
        let freshness = if has_snapshot {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Error
        };
        patch_workspace_resource_state(
            &mut workspace,
            freshness,
            last_successful_at,
            has_snapshot,
            Some(error),
        );
        workspace.clone()
    }

    pub fn bump_mutation_epoch(&self, session_key: Option<&str>) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        if !same_session_key(workspace.session_key.as_deref(), session_key) {
            return workspace.clone();
        }

        workspace.mutation_epoch += 1;
        bump_scene_workspace_revision(&mut workspace);
        let last_successful_at = workspace.resource_state.last_successful_at.clone();
        let has_snapshot = workspace.snapshot.is_some();
        let freshness = if workspace.refresh_status == SceneRefreshStatus::Refreshing {
            SceneResourceFreshness::Refreshing
        } else if has_snapshot {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Empty
        };
        let error_message = workspace.error_message.clone();
        patch_workspace_resource_state(
            &mut workspace,
            freshness,
            last_successful_at,
            has_snapshot,
            error_message,
        );
        workspace.clone()
    }

    pub fn reset(&self) {
        *self.workspace.lock() = SceneWorkspaceState::default();
    }
}

#[derive(Clone)]
struct SceneChildrenCacheEntry {
    mutation_epoch: u64,
    children: Vec<RuntimeSceneNodeSummary>,
    total_count: usize,
    last_successful_at: String,
}

#[derive(Default)]
struct SceneChildrenStore {
    active_session_key: Option<String>,
    tasks_by_parent: HashMap<String, RuntimeSceneObjectChildrenTaskState>,
    cache: HashMap<String, SceneChildrenCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
    resource_revision: u64,
}

pub struct SceneChildrenTaskStart {
    pub state: RuntimeSceneObjectChildrenTaskState,
    pub should_spawn: bool,
}

#[derive(Default)]
pub struct SceneChildrenState {
    store: Mutex<SceneChildrenStore>,
}

#[derive(Clone)]
struct SceneObjectHeaderCacheEntry {
    mutation_epoch: u64,
    header: RuntimeSceneObjectInspectorHeaderSnapshot,
    last_successful_at: String,
}

#[derive(Default)]
struct SceneObjectHeaderStore {
    active_session_key: Option<String>,
    tasks_by_object: HashMap<String, RuntimeSceneObjectHeaderTaskState>,
    cache: HashMap<String, SceneObjectHeaderCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
    resource_revision: u64,
}

pub struct SceneObjectHeaderTaskStart {
    pub state: RuntimeSceneObjectHeaderTaskState,
    pub use_cached: bool,
}

#[derive(Default)]
pub struct SceneObjectHeaderState {
    store: Mutex<SceneObjectHeaderStore>,
}

#[derive(Clone)]
struct SceneObjectComponentsCacheEntry {
    mutation_epoch: u64,
    components: Vec<RuntimeSceneComponentSummary>,
    total_count: usize,
    last_successful_at: String,
}

#[derive(Default)]
struct SceneObjectComponentsStore {
    active_session_key: Option<String>,
    tasks_by_object: HashMap<String, RuntimeSceneObjectComponentsTaskState>,
    cache: HashMap<String, SceneObjectComponentsCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
    resource_revision: u64,
}

pub struct SceneObjectComponentsTaskStart {
    pub state: RuntimeSceneObjectComponentsTaskState,
    pub should_spawn: bool,
}

#[derive(Default)]
pub struct SceneObjectComponentsState {
    store: Mutex<SceneObjectComponentsStore>,
}

fn summary_matches_object(summary: &RuntimeSceneNodeSummary, object_address: &str) -> bool {
    summary.object_address == object_address
}

fn scene_children_cache_entry_impacted(
    parent_object_address: &str,
    entry: &SceneChildrenCacheEntry,
    impacted: &[&str],
) -> bool {
    impacted.contains(&parent_object_address)
        || entry.children.iter().any(|child| {
            impacted
                .iter()
                .any(|address| summary_matches_object(child, address))
        })
}

fn scene_children_task_impacted(
    task: &RuntimeSceneObjectChildrenTaskState,
    impacted: &[&str],
) -> bool {
    impacted.contains(&task.parent_object_address.as_str())
        || task.children.iter().any(|child| {
            impacted
                .iter()
                .any(|address| summary_matches_object(child, address))
        })
}

fn header_cache_entry_impacted(entry: &SceneObjectHeaderCacheEntry, impacted: &[&str]) -> bool {
    if impacted
        .iter()
        .any(|address| summary_matches_object(&entry.header.object, address))
    {
        return true;
    }

    if entry.header.parent.as_ref().is_some_and(|parent| {
        impacted
            .iter()
            .any(|address| summary_matches_object(parent, address))
    }) {
        return true;
    }

    false
}

fn ensure_children_session(store: &mut SceneChildrenStore, session_key: Option<&str>) {
    if same_session_key(store.active_session_key.as_deref(), session_key) {
        return;
    }

    *store = SceneChildrenStore {
        active_session_key: session_key.map(str::to_owned),
        ..SceneChildrenStore::default()
    };
}

fn ensure_header_session(store: &mut SceneObjectHeaderStore, session_key: Option<&str>) {
    if same_session_key(store.active_session_key.as_deref(), session_key) {
        return;
    }

    *store = SceneObjectHeaderStore {
        active_session_key: session_key.map(str::to_owned),
        ..SceneObjectHeaderStore::default()
    };
}

fn ensure_components_session(store: &mut SceneObjectComponentsStore, session_key: Option<&str>) {
    if same_session_key(store.active_session_key.as_deref(), session_key) {
        return;
    }

    *store = SceneObjectComponentsStore {
        active_session_key: session_key.map(str::to_owned),
        ..SceneObjectComponentsStore::default()
    };
}

const MAX_RECENT_SCENE_MOUSE_PICKS: usize = 8;

#[derive(Default)]
struct SceneMousePickerStore {
    active_session_key: Option<String>,
    snapshot: RuntimeSceneMousePickerSnapshot,
    next_worker_id: u64,
    active_worker_id: Option<u64>,
    cancel_flag: Option<Arc<AtomicBool>>,
}

pub struct SceneMousePickerStart {
    pub snapshot: RuntimeSceneMousePickerSnapshot,
    pub worker_id: Option<u64>,
    pub cancel_flag: Option<Arc<AtomicBool>>,
}

#[derive(Default)]
pub struct SceneMousePickerState {
    store: Mutex<SceneMousePickerStore>,
}

fn default_scene_mouse_picker_snapshot(session_key: Option<&str>) -> RuntimeSceneMousePickerSnapshot {
    RuntimeSceneMousePickerSnapshot {
        session_key: session_key.map(str::to_owned),
        ..RuntimeSceneMousePickerSnapshot::default()
    }
}

fn bump_scene_mouse_picker_revision(snapshot: &mut RuntimeSceneMousePickerSnapshot) {
    snapshot.resource_revision += 1;
    snapshot.last_updated_at = Some(current_timestamp());
}

fn ensure_scene_mouse_picker_session(
    store: &mut SceneMousePickerStore,
    session_key: Option<&str>,
) {
    if same_session_key(store.active_session_key.as_deref(), session_key) {
        return;
    }

    if let Some(cancel_flag) = store.cancel_flag.take() {
        cancel_flag.store(true, Ordering::Relaxed);
    }

    *store = SceneMousePickerStore {
        active_session_key: session_key.map(str::to_owned),
        snapshot: default_scene_mouse_picker_snapshot(session_key),
        ..SceneMousePickerStore::default()
    };
}

fn clear_scene_mouse_picker_preview(snapshot: &mut RuntimeSceneMousePickerSnapshot) {
    snapshot.cursor_screen_position = None;
    snapshot.cursor_client_position = None;
    snapshot.cursor_inside_client = false;
    snapshot.current_candidate = None;
}

fn set_scene_mouse_picker_idle(snapshot: &mut RuntimeSceneMousePickerSnapshot, detail: Option<String>) {
    snapshot.is_running = false;
    snapshot.status = RuntimeSceneMousePickerStatus::Idle;
    snapshot.status_detail = detail;
    snapshot.error_message = None;
    clear_scene_mouse_picker_preview(snapshot);
}

fn set_scene_mouse_picker_armed(
    snapshot: &mut RuntimeSceneMousePickerSnapshot,
    detail: impl Into<String>,
) {
    snapshot.is_running = true;
    snapshot.status = RuntimeSceneMousePickerStatus::Armed;
    snapshot.status_detail = Some(detail.into());
    snapshot.error_message = None;
}

fn set_scene_mouse_picker_cancelled(
    snapshot: &mut RuntimeSceneMousePickerSnapshot,
    detail: impl Into<String>,
) {
    snapshot.is_running = false;
    snapshot.status = RuntimeSceneMousePickerStatus::Cancelled;
    snapshot.status_detail = Some(detail.into());
    snapshot.error_message = None;
    clear_scene_mouse_picker_preview(snapshot);
}

fn push_recent_scene_mouse_pick(
    recent_picks: &mut Vec<RuntimeSceneMouseTargetHit>,
    hit: RuntimeSceneMouseTargetHit,
) {
    recent_picks.retain(|entry| {
        entry.object_address != hit.object_address
            || entry.scene_handle != hit.scene_handle
            || entry.transform_address != hit.transform_address
    });
    recent_picks.insert(0, hit);
    recent_picks.truncate(MAX_RECENT_SCENE_MOUSE_PICKS);
}

impl SceneChildrenState {
    pub fn current(
        &self,
        parent_object_address: &str,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }

        store.tasks_by_parent.get(parent_object_address).cloned()
    }

    pub fn start_task(
        &self,
        parent_object_address: String,
        session_key: Option<String>,
    ) -> SceneChildrenTaskStart {
        let mut store = self.store.lock();
        ensure_children_session(&mut store, session_key.as_deref());

        if let Some(current) = store.tasks_by_parent.get(&parent_object_address) {
            if current.mutation_epoch == store.mutation_epoch
                && !current.is_stale
                && !matches!(
                    current.status,
                    RuntimeSceneChildrenTaskStatus::Error
                        | RuntimeSceneChildrenTaskStatus::Cancelled
                )
            {
                return SceneChildrenTaskStart {
                    state: current.clone(),
                    should_spawn: false,
                };
            }
        }

        let now = current_timestamp();
        let retained_task = store.tasks_by_parent.get(&parent_object_address).cloned();
        let mut state = RuntimeSceneObjectChildrenTaskState {
            session_key: store.active_session_key.clone(),
            parent_object_address: parent_object_address.clone(),
            status: RuntimeSceneChildrenTaskStatus::Loading,
            mutation_epoch: store.mutation_epoch,
            started_at: now.clone(),
            updated_at: now,
            ..RuntimeSceneObjectChildrenTaskState::default()
        };

        if let Some(retained) = retained_task.as_ref().filter(|task| task_has_retained_children(task)) {
            state.children = retained.children.clone();
            state.total_count = retained.total_count.max(retained.children.len());
            state.loaded_count = retained.children.len();
            state.resource_state.last_successful_at = retained.resource_state.last_successful_at.clone();
            state.resource_state.is_retaining_snapshot = true;
            state.resource_state.freshness = SceneResourceFreshness::Refreshing;
        }

        if let Some(cached) = store.cache.get(&parent_object_address).cloned() {
            if cached.mutation_epoch == store.mutation_epoch {
                store.next_task_id += 1;
                state.task_id = store.next_task_id;
                state.resource_revision = bump_children_revision(&mut store);
                state.status = RuntimeSceneChildrenTaskStatus::Ready;
                state.children = cached.children.clone();
                state.total_count = cached.total_count;
                state.loaded_count = state.children.len();
                patch_children_task_resource_state(
                    &mut state,
                    SceneResourceFreshness::Fresh,
                    Some(cached.last_successful_at.clone()),
                    true,
                    None,
                );
                store
                    .tasks_by_parent
                    .insert(parent_object_address, state.clone());
                return SceneChildrenTaskStart {
                    state,
                    should_spawn: false,
                };
            }
        }

        store.next_task_id += 1;
        state.task_id = store.next_task_id;
        state.resource_revision = bump_children_revision(&mut store);
        let is_retaining_snapshot = state.resource_state.is_retaining_snapshot;
        let last_successful_at = state.resource_state.last_successful_at.clone();
        let freshness = if is_retaining_snapshot {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Empty
        };
        patch_children_task_resource_state(
            &mut state,
            freshness,
            last_successful_at,
            is_retaining_snapshot,
            None,
        );
        store
            .tasks_by_parent
            .insert(parent_object_address, state.clone());
        SceneChildrenTaskStart {
            state,
            should_spawn: true,
        }
    }

    pub fn cancel(
        &self,
        parent_object_address: &str,
        task_id: Option<u64>,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_parent.get(parent_object_address)?;
            if task_id.is_some_and(|value| value != current.task_id) {
                return Some(current.clone());
            }
        }

        let next_revision = bump_children_revision(&mut store);
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        current.resource_revision = next_revision;
        current.status = if task_has_retained_children(current) {
            RuntimeSceneChildrenTaskStatus::Ready
        } else {
            RuntimeSceneChildrenTaskStatus::Cancelled
        };
        current.is_stale = true;
        current.updated_at = current_timestamp();
        let has_retained = task_has_retained_children(current);
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Empty
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        let error_message = current.error_message.clone();
        patch_children_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            error_message,
        );
        Some(current.clone())
    }

    pub fn apply_children(
        &self,
        parent_object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        offset: usize,
        children: Vec<RuntimeSceneNodeSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_parent.get(parent_object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_children_revision(&mut store);
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        current.resource_revision = next_revision;
        if offset == 0 {
            current.children = children;
        } else {
            current.children.extend(children);
        }
        current.total_count = total_count;
        current.loaded_count = current.children.len();
        current.next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneChildrenTaskStatus::Loading
        } else {
            RuntimeSceneChildrenTaskStatus::Ready
        };
        current.updated_at = current_timestamp();
        let has_retained = !current.children.is_empty();
        let freshness = if next_offset.is_some() {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Fresh
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_children_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            None,
        );
        Some(current.clone())
    }

    pub fn complete(
        &self,
        parent_object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_parent.get(parent_object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_children_revision(&mut store);
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        current.resource_revision = next_revision;
        current.status = RuntimeSceneChildrenTaskStatus::Ready;
        current.next_offset = None;
        current.updated_at = current_timestamp();
        patch_children_task_resource_state(
            current,
            SceneResourceFreshness::Fresh,
            Some(current.updated_at.clone()),
            !current.children.is_empty(),
            None,
        );

        let ready_state = current.clone();
        store.cache.insert(
            parent_object_address.to_string(),
            SceneChildrenCacheEntry {
                mutation_epoch,
                children: ready_state.children.clone(),
                total_count: ready_state.total_count.max(ready_state.children.len()),
                last_successful_at: ready_state
                    .resource_state
                    .last_successful_at
                    .clone()
                    .unwrap_or_else(current_timestamp),
            },
        );
        Some(ready_state)
    }

    pub fn fail(
        &self,
        parent_object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        error_message: String,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_parent.get(parent_object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_children_revision(&mut store);
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_children(current);
        current.status = RuntimeSceneChildrenTaskStatus::Error;
        current.error_message = Some(error_message.clone());
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Error
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_children_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            Some(error_message),
        );
        Some(current.clone())
    }

    pub fn invalidate_related(&self, impacted_addresses: &[String], session_key: Option<&str>) {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return;
        }
        store.mutation_epoch += 1;

        if impacted_addresses.is_empty() {
            store.cache.clear();
        } else {
            let impacted_refs = impacted_addresses
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>();
            store.cache.retain(|parent_object_address, entry| {
                !scene_children_cache_entry_impacted(parent_object_address, entry, &impacted_refs)
            });
        }

        let impacted_refs = impacted_addresses
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let has_impacted_task = store.tasks_by_parent.values().any(|task| {
            impacted_addresses.is_empty() || scene_children_task_impacted(task, &impacted_refs)
        });
        let next_revision = has_impacted_task.then(|| bump_children_revision(&mut store));
        for task in store.tasks_by_parent.values_mut() {
            if impacted_addresses.is_empty() || scene_children_task_impacted(task, &impacted_refs) {
                if let Some(next_revision) = next_revision {
                    task.resource_revision = next_revision;
                }
                task.is_stale = true;
                let has_retained = task_has_retained_children(task);
                task.status = if has_retained {
                    RuntimeSceneChildrenTaskStatus::Ready
                } else {
                    RuntimeSceneChildrenTaskStatus::Cancelled
                };
                task.updated_at = current_timestamp();
                let freshness = if has_retained {
                    SceneResourceFreshness::Stale
                } else {
                    SceneResourceFreshness::Empty
                };
                let last_successful_at = task.resource_state.last_successful_at.clone();
                let error_message = task.error_message.clone();
                patch_children_task_resource_state(
                    task,
                    freshness,
                    last_successful_at,
                    has_retained,
                    error_message,
                );
            }
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneChildrenStore::default();
    }
}

impl SceneObjectHeaderState {
    pub fn current(
        &self,
        object_address: &str,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectHeaderTaskState> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }

        store.tasks_by_object.get(object_address).cloned()
    }

    pub fn start_task(
        &self,
        object_address: String,
        session_key: Option<String>,
    ) -> SceneObjectHeaderTaskStart {
        let mut store = self.store.lock();
        ensure_header_session(&mut store, session_key.as_deref());

        if let Some(current) = store.tasks_by_object.get(&object_address) {
            if current.mutation_epoch == store.mutation_epoch
                && !current.is_stale
                && !matches!(
                    current.status,
                    RuntimeSceneObjectHeaderTaskStatus::Error
                        | RuntimeSceneObjectHeaderTaskStatus::Cancelled
                )
            {
                return SceneObjectHeaderTaskStart {
                    state: current.clone(),
                    use_cached: current.status == RuntimeSceneObjectHeaderTaskStatus::Ready,
                };
            }
        }

        let retained_task = store.tasks_by_object.get(&object_address).cloned();
        let now = current_timestamp();
        let mut state = RuntimeSceneObjectHeaderTaskState {
            session_key: store.active_session_key.clone(),
            object_address: object_address.clone(),
            status: RuntimeSceneObjectHeaderTaskStatus::Loading,
            mutation_epoch: store.mutation_epoch,
            started_at: now.clone(),
            updated_at: now,
            ..RuntimeSceneObjectHeaderTaskState::default()
        };

        if let Some(retained) = retained_task.as_ref().filter(|task| task_has_retained_header(task)) {
            state.header = retained.header.clone();
            state.resource_state.last_successful_at = retained.resource_state.last_successful_at.clone();
            state.resource_state.is_retaining_snapshot = true;
            state.resource_state.freshness = SceneResourceFreshness::Refreshing;
        }

        if let Some(cached) = store.cache.get(&object_address).cloned() {
            if cached.mutation_epoch == store.mutation_epoch {
                store.next_task_id += 1;
                state.task_id = store.next_task_id;
                state.resource_revision = bump_header_revision(&mut store);
                state.status = RuntimeSceneObjectHeaderTaskStatus::Ready;
                state.header = Some(cached.header);
                patch_header_task_resource_state(
                    &mut state,
                    SceneResourceFreshness::Fresh,
                    Some(cached.last_successful_at),
                    true,
                    None,
                );
                store.tasks_by_object.insert(object_address, state.clone());
                return SceneObjectHeaderTaskStart {
                    state,
                    use_cached: true,
                };
            }
        }

        store.next_task_id += 1;
        state.task_id = store.next_task_id;
        state.resource_revision = bump_header_revision(&mut store);
        let is_retaining_snapshot = state.resource_state.is_retaining_snapshot;
        let last_successful_at = state.resource_state.last_successful_at.clone();
        let freshness = if is_retaining_snapshot {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Empty
        };
        patch_header_task_resource_state(
            &mut state,
            freshness,
            last_successful_at,
            is_retaining_snapshot,
            None,
        );
        store.tasks_by_object.insert(object_address, state.clone());
        SceneObjectHeaderTaskStart {
            state,
            use_cached: false,
        }
    }

    pub fn cancel(
        &self,
        object_address: &str,
        task_id: Option<u64>,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectHeaderTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if task_id.is_some_and(|value| value != current.task_id) {
                return Some(current.clone());
            }
        }

        let next_revision = bump_header_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_header(current);
        current.status = if has_retained {
            RuntimeSceneObjectHeaderTaskStatus::Ready
        } else {
            RuntimeSceneObjectHeaderTaskStatus::Cancelled
        };
        current.is_stale = true;
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Empty
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        let error_message = current.error_message.clone();
        patch_header_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            error_message,
        );
        Some(current.clone())
    }

    pub fn apply_header(
        &self,
        object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        header: RuntimeSceneObjectInspectorHeaderSnapshot,
    ) -> Option<RuntimeSceneObjectHeaderTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_header_revision(&mut store);
        let ready_state = {
            let current = store.tasks_by_object.get_mut(object_address)?;
            current.resource_revision = next_revision;
            current.header = Some(header.clone());
            current.status = RuntimeSceneObjectHeaderTaskStatus::Ready;
            current.updated_at = current_timestamp();
            patch_header_task_resource_state(
                current,
                SceneResourceFreshness::Fresh,
                Some(current.updated_at.clone()),
                true,
                None,
            );
            current.clone()
        };

        store.cache.insert(
            object_address.to_string(),
            SceneObjectHeaderCacheEntry {
                mutation_epoch,
                header,
                last_successful_at: ready_state
                    .resource_state
                    .last_successful_at
                    .clone()
                    .unwrap_or_else(current_timestamp),
            },
        );

        Some(ready_state)
    }

    pub fn fail(
        &self,
        object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        error_message: String,
    ) -> Option<RuntimeSceneObjectHeaderTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_header_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_header(current);
        current.status = RuntimeSceneObjectHeaderTaskStatus::Error;
        current.error_message = Some(error_message.clone());
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Error
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_header_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            Some(error_message),
        );
        Some(current.clone())
    }

    pub fn invalidate_related(&self, impacted_addresses: &[String], session_key: Option<&str>) {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return;
        }
        store.mutation_epoch += 1;

        if impacted_addresses.is_empty() {
            store.cache.clear();
        } else {
            let impacted_refs = impacted_addresses
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>();
            store.cache.retain(|object_address, entry| {
                !impacted_refs.contains(&object_address.as_str())
                    && !header_cache_entry_impacted(entry, &impacted_refs)
            });
        }

        let impacted_refs = impacted_addresses
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let has_impacted_task = store.tasks_by_object.values().any(|task| {
            impacted_addresses.is_empty()
                || impacted_refs.contains(&task.object_address.as_str())
                || task.header.as_ref().is_some_and(|header| {
                    impacted_refs.contains(&header.object.object_address.as_str())
                        || header.parent.as_ref().is_some_and(|parent| {
                            impacted_refs.contains(&parent.object_address.as_str())
                        })
                })
        });
        let next_revision = has_impacted_task.then(|| bump_header_revision(&mut store));
        for task in store.tasks_by_object.values_mut() {
            let impacted = impacted_addresses.is_empty()
                || impacted_refs.contains(&task.object_address.as_str())
                || task.header.as_ref().is_some_and(|header| {
                    impacted_refs.contains(&header.object.object_address.as_str())
                        || header.parent.as_ref().is_some_and(|parent| {
                            impacted_refs.contains(&parent.object_address.as_str())
                        })
                });
            if impacted {
                if let Some(next_revision) = next_revision {
                    task.resource_revision = next_revision;
                }
                task.is_stale = true;
                let has_retained = task_has_retained_header(task);
                task.status = if has_retained {
                    RuntimeSceneObjectHeaderTaskStatus::Ready
                } else {
                    RuntimeSceneObjectHeaderTaskStatus::Cancelled
                };
                task.updated_at = current_timestamp();
                let freshness = if has_retained {
                    SceneResourceFreshness::Stale
                } else {
                    SceneResourceFreshness::Empty
                };
                let last_successful_at = task.resource_state.last_successful_at.clone();
                let error_message = task.error_message.clone();
                patch_header_task_resource_state(
                    task,
                    freshness,
                    last_successful_at,
                    has_retained,
                    error_message,
                );
            }
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneObjectHeaderStore::default();
    }
}

impl SceneObjectComponentsState {
    pub fn current(
        &self,
        object_address: &str,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectComponentsTaskState> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }

        store.tasks_by_object.get(object_address).cloned()
    }

    pub fn start_task(
        &self,
        object_address: String,
        session_key: Option<String>,
    ) -> SceneObjectComponentsTaskStart {
        let mut store = self.store.lock();
        ensure_components_session(&mut store, session_key.as_deref());

        if let Some(current) = store.tasks_by_object.get(&object_address) {
            if current.mutation_epoch == store.mutation_epoch
                && !current.is_stale
                && !matches!(
                    current.status,
                    RuntimeSceneObjectComponentsTaskStatus::Error
                        | RuntimeSceneObjectComponentsTaskStatus::Cancelled
                )
            {
                return SceneObjectComponentsTaskStart {
                    state: current.clone(),
                    should_spawn: false,
                };
            }
        }

        let retained_task = store.tasks_by_object.get(&object_address).cloned();
        let now = current_timestamp();
        let mut state = RuntimeSceneObjectComponentsTaskState {
            session_key: store.active_session_key.clone(),
            object_address: object_address.clone(),
            status: RuntimeSceneObjectComponentsTaskStatus::Loading,
            mutation_epoch: store.mutation_epoch,
            started_at: now.clone(),
            updated_at: now,
            ..RuntimeSceneObjectComponentsTaskState::default()
        };

        if let Some(retained) = retained_task.as_ref().filter(|task| task_has_retained_components(task)) {
            state.components = retained.components.clone();
            state.total_count = retained.total_count.max(retained.components.len());
            state.loaded_count = retained.components.len();
            state.resource_state.last_successful_at = retained.resource_state.last_successful_at.clone();
            state.resource_state.is_retaining_snapshot = true;
            state.resource_state.freshness = SceneResourceFreshness::Refreshing;
        }

        if let Some(cached) = store.cache.get(&object_address).cloned() {
            if cached.mutation_epoch == store.mutation_epoch {
                store.next_task_id += 1;
                state.task_id = store.next_task_id;
                state.resource_revision = bump_components_revision(&mut store);
                state.status = RuntimeSceneObjectComponentsTaskStatus::Ready;
                state.components = cached.components;
                state.total_count = cached.total_count;
                state.loaded_count = state.components.len();
                patch_components_task_resource_state(
                    &mut state,
                    SceneResourceFreshness::Fresh,
                    Some(cached.last_successful_at),
                    true,
                    None,
                );
                store.tasks_by_object.insert(object_address, state.clone());
                return SceneObjectComponentsTaskStart {
                    state,
                    should_spawn: false,
                };
            }
        }

        store.next_task_id += 1;
        state.task_id = store.next_task_id;
        state.resource_revision = bump_components_revision(&mut store);
        let is_retaining_snapshot = state.resource_state.is_retaining_snapshot;
        let last_successful_at = state.resource_state.last_successful_at.clone();
        let freshness = if is_retaining_snapshot {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Empty
        };
        patch_components_task_resource_state(
            &mut state,
            freshness,
            last_successful_at,
            is_retaining_snapshot,
            None,
        );
        store.tasks_by_object.insert(object_address, state.clone());
        SceneObjectComponentsTaskStart {
            state,
            should_spawn: true,
        }
    }

    pub fn cancel(
        &self,
        object_address: &str,
        task_id: Option<u64>,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectComponentsTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if task_id.is_some_and(|value| value != current.task_id) {
                return Some(current.clone());
            }
        }

        let next_revision = bump_components_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_components(current);
        current.status = if has_retained {
            RuntimeSceneObjectComponentsTaskStatus::Ready
        } else {
            RuntimeSceneObjectComponentsTaskStatus::Cancelled
        };
        current.is_stale = true;
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Empty
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        let error_message = current.error_message.clone();
        patch_components_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            error_message,
        );
        Some(current.clone())
    }

    pub fn apply_components(
        &self,
        object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        offset: usize,
        components: Vec<RuntimeSceneComponentSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectComponentsTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_components_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        if offset == 0 {
            current.components = components;
        } else {
            current.components.extend(components);
        }
        current.total_count = total_count;
        current.loaded_count = current.components.len();
        current.next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneObjectComponentsTaskStatus::Loading
        } else {
            RuntimeSceneObjectComponentsTaskStatus::Ready
        };
        current.updated_at = current_timestamp();
        let freshness = if next_offset.is_some() {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Fresh
        };
        let has_retained = task_has_retained_components(current);
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_components_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            None,
        );
        Some(current.clone())
    }

    pub fn complete(
        &self,
        object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectComponentsTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_components_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        current.status = RuntimeSceneObjectComponentsTaskStatus::Ready;
        current.next_offset = None;
        current.updated_at = current_timestamp();
        let has_retained = task_has_retained_components(current);
        patch_components_task_resource_state(
            current,
            SceneResourceFreshness::Fresh,
            Some(current.updated_at.clone()),
            has_retained,
            None,
        );

        let ready_state = current.clone();
        store.cache.insert(
            object_address.to_string(),
            SceneObjectComponentsCacheEntry {
                mutation_epoch,
                components: ready_state.components.clone(),
                total_count: ready_state.total_count.max(ready_state.components.len()),
                last_successful_at: ready_state
                    .resource_state
                    .last_successful_at
                    .clone()
                    .unwrap_or_else(current_timestamp),
            },
        );
        Some(ready_state)
    }

    pub fn fail(
        &self,
        object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        error_message: String,
    ) -> Option<RuntimeSceneObjectComponentsTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.tasks_by_object.get(object_address)?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_components_revision(&mut store);
        let current = store.tasks_by_object.get_mut(object_address)?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_components(current);
        current.status = RuntimeSceneObjectComponentsTaskStatus::Error;
        current.error_message = Some(error_message.clone());
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Error
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_components_task_resource_state(
            current,
            freshness,
            last_successful_at,
            has_retained,
            Some(error_message),
        );
        Some(current.clone())
    }

    pub fn invalidate_related(&self, impacted_addresses: &[String], session_key: Option<&str>) {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return;
        }
        store.mutation_epoch += 1;

        if impacted_addresses.is_empty() {
            store.cache.clear();
        } else {
            let impacted_refs = impacted_addresses
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>();
            store.cache.retain(|object_address, _| !impacted_refs.contains(&object_address.as_str()));
        }

        let impacted_refs = impacted_addresses
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let has_impacted_task = store.tasks_by_object.values().any(|task| {
            impacted_addresses.is_empty() || impacted_refs.contains(&task.object_address.as_str())
        });
        let next_revision = has_impacted_task.then(|| bump_components_revision(&mut store));
        for task in store.tasks_by_object.values_mut() {
            if impacted_addresses.is_empty() || impacted_refs.contains(&task.object_address.as_str()) {
                if let Some(next_revision) = next_revision {
                    task.resource_revision = next_revision;
                }
                task.is_stale = true;
                let has_retained = task_has_retained_components(task);
                task.status = if has_retained {
                    RuntimeSceneObjectComponentsTaskStatus::Ready
                } else {
                    RuntimeSceneObjectComponentsTaskStatus::Cancelled
                };
                task.updated_at = current_timestamp();
                let freshness = if has_retained {
                    SceneResourceFreshness::Stale
                } else {
                    SceneResourceFreshness::Empty
                };
                let last_successful_at = task.resource_state.last_successful_at.clone();
                let error_message = task.error_message.clone();
                patch_components_task_resource_state(
                    task,
                    freshness,
                    last_successful_at,
                    has_retained,
                    error_message,
                );
            }
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneObjectComponentsStore::default();
    }
}

impl SceneMousePickerState {
    pub fn reset(&self) {
        let mut store = self.store.lock();
        if let Some(cancel_flag) = store.cancel_flag.take() {
            cancel_flag.store(true, Ordering::Relaxed);
        }
        *store = SceneMousePickerStore::default();
    }

    pub fn current_for(
        &self,
        session_key: Option<&str>,
    ) -> RuntimeSceneMousePickerSnapshot {
        let store = self.store.lock();
        if same_session_key(store.active_session_key.as_deref(), session_key) {
            store.snapshot.clone()
        } else {
            default_scene_mouse_picker_snapshot(session_key)
        }
    }

    pub fn set_target_window(
        &self,
        session_key: Option<String>,
        target_window: Option<ProcessWindowCandidate>,
    ) -> RuntimeSceneMousePickerSnapshot {
        let mut store = self.store.lock();
        ensure_scene_mouse_picker_session(&mut store, session_key.as_deref());

        store.snapshot.session_key = store.active_session_key.clone();
        store.snapshot.target_window = target_window;
        if store.snapshot.target_window.is_none() {
            clear_scene_mouse_picker_preview(&mut store.snapshot);
            if store.snapshot.is_running {
                set_scene_mouse_picker_armed(
                    &mut store.snapshot,
                    "Select a game window to continue picking.",
                );
            } else {
                set_scene_mouse_picker_idle(&mut store.snapshot, None);
            }
        }
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        store.snapshot.clone()
    }

    pub fn start(
        &self,
        session_key: Option<String>,
    ) -> Result<SceneMousePickerStart, String> {
        let mut store = self.store.lock();
        ensure_scene_mouse_picker_session(&mut store, session_key.as_deref());

        if store.snapshot.target_window.is_none() {
            return Err("Scene picker requires a selected target window".to_string());
        }

        if store.active_worker_id.is_some() {
            set_scene_mouse_picker_armed(
                &mut store.snapshot,
                "Move the cursor over the target window and click a visible object.",
            );
            bump_scene_mouse_picker_revision(&mut store.snapshot);
            return Ok(SceneMousePickerStart {
                snapshot: store.snapshot.clone(),
                worker_id: None,
                cancel_flag: None,
            });
        }

        store.next_worker_id += 1;
        let worker_id = store.next_worker_id;
        let cancel_flag = Arc::new(AtomicBool::new(false));
        store.active_worker_id = Some(worker_id);
        store.cancel_flag = Some(cancel_flag.clone());
        set_scene_mouse_picker_armed(
            &mut store.snapshot,
            "Move the cursor over the target window and click a visible object.",
        );
        bump_scene_mouse_picker_revision(&mut store.snapshot);

        Ok(SceneMousePickerStart {
            snapshot: store.snapshot.clone(),
            worker_id: Some(worker_id),
            cancel_flag: Some(cancel_flag),
        })
    }

    pub fn stop(&self, session_key: Option<&str>) -> RuntimeSceneMousePickerSnapshot {
        let mut store = self.store.lock();
        ensure_scene_mouse_picker_session(&mut store, session_key);

        if let Some(cancel_flag) = store.cancel_flag.take() {
            cancel_flag.store(true, Ordering::Relaxed);
        }
        store.active_worker_id = None;
        set_scene_mouse_picker_cancelled(&mut store.snapshot, "Picker stopped.");
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        store.snapshot.clone()
    }

    pub fn current_target_window(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
    ) -> Option<ProcessWindowCandidate> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        store.snapshot.target_window.clone()
    }

    pub fn current_candidate(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneMouseTargetHit> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        store.snapshot.current_candidate.clone()
    }

    pub fn apply_observation(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
        target_window: ProcessWindowCandidate,
        cursor_screen_position: RuntimeScreenPoint,
        cursor_client_position: Option<RuntimeScreenPoint>,
        current_candidate: Option<RuntimeSceneMouseTargetHit>,
        status_detail: String,
    ) -> Option<RuntimeSceneMousePickerSnapshot> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        store.snapshot.session_key = store.active_session_key.clone();
        store.snapshot.target_window = Some(target_window);
        store.snapshot.cursor_screen_position = Some(cursor_screen_position);
        store.snapshot.cursor_inside_client = cursor_client_position.is_some();
        store.snapshot.cursor_client_position = cursor_client_position;
        store.snapshot.current_candidate = current_candidate;
        store.snapshot.is_running = true;
        store.snapshot.status = if store.snapshot.cursor_inside_client {
            RuntimeSceneMousePickerStatus::TrackingCandidate
        } else {
            RuntimeSceneMousePickerStatus::Armed
        };
        store.snapshot.status_detail = Some(status_detail);
        store.snapshot.error_message = None;
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

    pub fn commit_pick(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
        picked_hit: Option<RuntimeSceneMouseTargetHit>,
        status_detail: String,
    ) -> Option<RuntimeSceneMousePickerSnapshot> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        if let Some(mut hit) = picked_hit {
            hit.observed_at = current_timestamp();
            store.snapshot.current_candidate = Some(hit.clone());
            store.snapshot.committed_pick = Some(hit.clone());
            push_recent_scene_mouse_pick(&mut store.snapshot.recent_picks, hit);
            if let Some(cancel_flag) = store.cancel_flag.take() {
                cancel_flag.store(true, Ordering::Relaxed);
            }
            store.active_worker_id = None;
            store.snapshot.is_running = false;
            store.snapshot.status = RuntimeSceneMousePickerStatus::Committed;
            store.snapshot.status_detail = Some(status_detail);
            store.snapshot.error_message = None;
        } else {
            if let Some(cancel_flag) = store.cancel_flag.take() {
                cancel_flag.store(true, Ordering::Relaxed);
            }
            store.active_worker_id = None;
            set_scene_mouse_picker_cancelled(&mut store.snapshot, status_detail);
        }
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

    pub fn cancel(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
        status_detail: String,
    ) -> Option<RuntimeSceneMousePickerSnapshot> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        if let Some(cancel_flag) = store.cancel_flag.take() {
            cancel_flag.store(true, Ordering::Relaxed);
        }
        store.active_worker_id = None;
        set_scene_mouse_picker_cancelled(&mut store.snapshot, status_detail);
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

    pub fn fail(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
        error_message: String,
    ) -> Option<RuntimeSceneMousePickerSnapshot> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        if let Some(cancel_flag) = store.cancel_flag.take() {
            cancel_flag.store(true, Ordering::Relaxed);
        }
        store.active_worker_id = None;
        store.snapshot.is_running = false;
        store.snapshot.status = RuntimeSceneMousePickerStatus::Error;
        store.snapshot.status_detail = Some(error_message.clone());
        store.snapshot.error_message = Some(error_message);
        clear_scene_mouse_picker_preview(&mut store.snapshot);
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

    pub fn finish_worker(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneMousePickerSnapshot> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key)
            || store.active_worker_id != Some(worker_id)
        {
            return None;
        }

        store.cancel_flag = None;
        store.active_worker_id = None;
        set_scene_mouse_picker_idle(&mut store.snapshot, None);
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

}
