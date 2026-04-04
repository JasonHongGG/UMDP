use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenTaskStatus,
    RuntimeSceneComponentSummary, RuntimeSceneInspectorTaskStatus,
    RuntimeSceneMousePickerSnapshot, RuntimeSceneMousePickerStatus,
    RuntimeSceneMouseTargetHit, RuntimeSceneNodeSummary,
    RuntimeSceneObjectChildrenTaskState, RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectInspectorTaskState, RuntimeSceneResourceKind,
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

fn bump_inspector_revision(store: &mut SceneInspectorStore) -> u64 {
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

fn patch_inspector_task_resource_state(
    task: &mut RuntimeSceneObjectInspectorTaskState,
    freshness: SceneResourceFreshness,
    last_successful_at: Option<String>,
    is_retaining_snapshot: bool,
    error_message: Option<String>,
) {
    let session_key = task.session_key.clone();
    patch_resource_state(
        &mut task.resource_state,
        RuntimeSceneResourceKind::Inspector,
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

fn task_has_retained_inspector(task: &RuntimeSceneObjectInspectorTaskState) -> bool {
    task.header.is_some() || !task.children.is_empty() || !task.components.is_empty()
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
struct SceneInspectorCacheEntry {
    mutation_epoch: u64,
    header: RuntimeSceneObjectInspectorHeaderSnapshot,
    children: Vec<RuntimeSceneNodeSummary>,
    components: Vec<RuntimeSceneComponentSummary>,
    last_successful_at: String,
}

#[derive(Default)]
struct SceneInspectorStore {
    active_session_key: Option<String>,
    current: Option<RuntimeSceneObjectInspectorTaskState>,
    cache: HashMap<String, SceneInspectorCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
    resource_revision: u64,
}

pub struct SceneInspectorTaskStart {
    pub state: RuntimeSceneObjectInspectorTaskState,
    pub use_cached: bool,
}

#[derive(Default)]
pub struct SceneInspectorState {
    store: Mutex<SceneInspectorStore>,
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

fn cache_entry_impacted(entry: &SceneInspectorCacheEntry, impacted: &[&str]) -> bool {
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

    entry.children.iter().any(|child| {
        impacted
            .iter()
            .any(|address| summary_matches_object(child, address))
    })
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

fn ensure_inspector_session(store: &mut SceneInspectorStore, session_key: Option<&str>) {
    if same_session_key(store.active_session_key.as_deref(), session_key) {
        return;
    }

    *store = SceneInspectorStore {
        active_session_key: session_key.map(str::to_owned),
        ..SceneInspectorStore::default()
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
    snapshot.hover_hit = None;
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

impl SceneInspectorState {
    pub fn current(
        &self,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }

        store.current.clone()
    }

    pub fn start_task(
        &self,
        object_address: String,
        session_key: Option<String>,
    ) -> SceneInspectorTaskStart {
        let mut store = self.store.lock();
        ensure_inspector_session(&mut store, session_key.as_deref());
        store.next_task_id += 1;
        let task_id = store.next_task_id;
        let now = current_timestamp();

        let mut state = RuntimeSceneObjectInspectorTaskState {
            task_id,
            resource_revision: bump_inspector_revision(&mut store),
            session_key: store.active_session_key.clone(),
            object_address: object_address.clone(),
            status: RuntimeSceneInspectorTaskStatus::HeaderLoading,
            mutation_epoch: store.mutation_epoch,
            started_at: now.clone(),
            updated_at: now,
            ..RuntimeSceneObjectInspectorTaskState::default()
        };

        if let Some(retained) = store.current.as_ref().filter(|task| {
            task.object_address == object_address && task_has_retained_inspector(task)
        }) {
            state.header = retained.header.clone();
            state.children = retained.children.clone();
            state.children_total_count = retained.children_total_count;
            state.children_loaded_count = retained.children.len();
            state.components = retained.components.clone();
            state.components_total_count = retained.components_total_count;
            state.components_loaded_count = retained.components.len();
            state.resource_state.last_successful_at = retained.resource_state.last_successful_at.clone();
            state.resource_state.is_retaining_snapshot = true;
            state.resource_state.freshness = SceneResourceFreshness::Refreshing;
        }

        let use_cached = if let Some(cached) = store.cache.get(&object_address) {
            if cached.mutation_epoch == store.mutation_epoch {
                state.status = RuntimeSceneInspectorTaskStatus::Ready;
                state.header = Some(cached.header.clone());
                state.children = cached.children.clone();
                state.children_total_count = state.children.len();
                state.children_loaded_count = state.children.len();
                state.components = cached.components.clone();
                state.components_total_count = state.components.len();
                state.components_loaded_count = state.components.len();
                patch_inspector_task_resource_state(
                    &mut state,
                    SceneResourceFreshness::Fresh,
                    Some(cached.last_successful_at.clone()),
                    true,
                    None,
                );
                true
            } else {
                false
            }
        } else {
            false
        };

        if !use_cached {
            let is_retaining_snapshot = state.resource_state.is_retaining_snapshot;
            let last_successful_at = state.resource_state.last_successful_at.clone();
            let freshness = if is_retaining_snapshot {
                SceneResourceFreshness::Refreshing
            } else {
                SceneResourceFreshness::Empty
            };
            patch_inspector_task_resource_state(
                &mut state,
                freshness,
                last_successful_at,
                is_retaining_snapshot,
                None,
            );
        }

        store.current = Some(state.clone());
        SceneInspectorTaskStart { state, use_cached }
    }

    pub fn cancel(
        &self,
        task_id: Option<u64>,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if task_id.is_some_and(|value| value != current.task_id) {
                return Some(current.clone());
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_inspector(current);
        current.status = if has_retained {
            RuntimeSceneInspectorTaskStatus::Ready
        } else {
            RuntimeSceneInspectorTaskStatus::Cancelled
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
        patch_inspector_task_resource_state(
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
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        header: RuntimeSceneObjectInspectorHeaderSnapshot,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        current.header = Some(header);
        current.status = RuntimeSceneInspectorTaskStatus::ChildrenLoading;
        current.updated_at = current_timestamp();
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_inspector_task_resource_state(
            current,
            SceneResourceFreshness::Refreshing,
            last_successful_at,
            true,
            None,
        );
        Some(current.clone())
    }

    pub fn apply_children(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        offset: usize,
        children: Vec<RuntimeSceneNodeSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        if offset == 0 {
            current.children = children;
        } else {
            current.children.extend(children);
        }
        current.children_total_count = total_count;
        current.children_loaded_count = current.children.len();
        current.children_next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneInspectorTaskStatus::ChildrenLoading
        } else {
            RuntimeSceneInspectorTaskStatus::ComponentsLoading
        };
        current.updated_at = current_timestamp();
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_inspector_task_resource_state(
            current,
            SceneResourceFreshness::Refreshing,
            last_successful_at,
            true,
            None,
        );
        Some(current.clone())
    }

    pub fn apply_components(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        offset: usize,
        components: Vec<RuntimeSceneComponentSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        if offset == 0 {
            current.components = components;
        } else {
            current.components.extend(components);
        }
        current.components_total_count = total_count;
        current.components_loaded_count = current.components.len();
        current.components_next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneInspectorTaskStatus::ComponentsLoading
        } else {
            RuntimeSceneInspectorTaskStatus::Ready
        };
        current.updated_at = current_timestamp();
        let freshness = if next_offset.is_some() {
            SceneResourceFreshness::Refreshing
        } else {
            SceneResourceFreshness::Fresh
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_inspector_task_resource_state(
            current,
            freshness,
            last_successful_at,
            true,
            None,
        );
        Some(current.clone())
    }

    pub fn complete(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        current.status = RuntimeSceneInspectorTaskStatus::Ready;
        current.children_next_offset = None;
        current.components_next_offset = None;
        current.updated_at = current_timestamp();
        patch_inspector_task_resource_state(
            current,
            SceneResourceFreshness::Fresh,
            Some(current.updated_at.clone()),
            true,
            None,
        );

        let ready_state = current.clone();
        let cache_entry = ready_state.header.clone().map(|header| {
            (
                ready_state.object_address.clone(),
                SceneInspectorCacheEntry {
                    mutation_epoch,
                    header,
                    children: ready_state.children.clone(),
                    components: ready_state.components.clone(),
                    last_successful_at: ready_state
                        .resource_state
                        .last_successful_at
                        .clone()
                        .unwrap_or_else(current_timestamp),
                },
            )
        });

        if let Some((object_address, entry)) = cache_entry {
            store.cache.insert(object_address, entry);
        }

        Some(ready_state)
    }

    pub fn fail(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
        error_message: String,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }
        {
            let current = store.current.as_ref()?;
            if current.task_id != task_id
                || current.mutation_epoch != mutation_epoch
                || !same_session_key(current.session_key.as_deref(), session_key)
            {
                return None;
            }
        }

        let next_revision = bump_inspector_revision(&mut store);
        let current = store.current.as_mut()?;
        current.resource_revision = next_revision;
        let has_retained = task_has_retained_inspector(current);
        current.status = RuntimeSceneInspectorTaskStatus::Error;
        current.error_message = Some(error_message.clone());
        current.updated_at = current_timestamp();
        let freshness = if has_retained {
            SceneResourceFreshness::Stale
        } else {
            SceneResourceFreshness::Error
        };
        let last_successful_at = current.resource_state.last_successful_at.clone();
        patch_inspector_task_resource_state(
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
                    && !cache_entry_impacted(entry, &impacted_refs)
            });
        }

        let next_revision = store
            .current
            .is_some()
            .then(|| bump_inspector_revision(&mut store));
        if let Some(current) = store.current.as_mut() {
            if let Some(next_revision) = next_revision {
                current.resource_revision = next_revision;
            }
            current.is_stale = true;
            let has_retained = task_has_retained_inspector(current);
            current.status = if has_retained {
                RuntimeSceneInspectorTaskStatus::Ready
            } else {
                RuntimeSceneInspectorTaskStatus::Cancelled
            };
            current.updated_at = current_timestamp();
            let freshness = if has_retained {
                SceneResourceFreshness::Stale
            } else {
                SceneResourceFreshness::Empty
            };
            let last_successful_at = current.resource_state.last_successful_at.clone();
            let error_message = current.error_message.clone();
            patch_inspector_task_resource_state(
                current,
                freshness,
                last_successful_at,
                has_retained,
                error_message,
            );
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneInspectorStore::default();
    }
}

impl SceneMousePickerState {
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
            store.snapshot.last_pick = None;
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
        set_scene_mouse_picker_idle(&mut store.snapshot, None);
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

    pub fn apply_observation(
        &self,
        worker_id: u64,
        session_key: Option<&str>,
        target_window: ProcessWindowCandidate,
        cursor_screen_position: RuntimeScreenPoint,
        cursor_client_position: Option<RuntimeScreenPoint>,
        hover_hit: Option<RuntimeSceneMouseTargetHit>,
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
        store.snapshot.hover_hit = hover_hit;
        store.snapshot.is_running = true;
        store.snapshot.status = if store.snapshot.cursor_inside_client {
            RuntimeSceneMousePickerStatus::Tracking
        } else {
            RuntimeSceneMousePickerStatus::Armed
        };
        store.snapshot.status_detail = Some(status_detail);
        store.snapshot.error_message = None;
        bump_scene_mouse_picker_revision(&mut store.snapshot);
        Some(store.snapshot.clone())
    }

    pub fn record_pick(
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

        store.snapshot.last_pick = picked_hit.clone();
        if let Some(hit) = picked_hit {
            push_recent_scene_mouse_pick(&mut store.snapshot.recent_picks, hit);
        }
        store.snapshot.status_detail = Some(status_detail);
        store.snapshot.error_message = None;
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
