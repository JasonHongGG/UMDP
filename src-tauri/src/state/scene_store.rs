use crate::domain::analysis_models::{
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenTaskStatus,
    RuntimeSceneComponentSummary, RuntimeSceneInspectorTaskStatus,
    RuntimeSceneNodeSummary, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectInspectorHeaderSnapshot, RuntimeSceneObjectInspectorTaskState,
    SceneRefreshStatus, SceneWorkspaceState,
};
use parking_lot::Mutex;
use std::collections::HashMap;

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
        ..SceneWorkspaceState::default()
    }
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
        workspace.session_key = session_key;
        workspace.refresh_status = SceneRefreshStatus::Refreshing;
        workspace.error_message = None;
        bump_scene_workspace_revision(&mut workspace);
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
        workspace.refresh_status = SceneRefreshStatus::Ready;
        workspace.error_message = None;
        workspace.last_updated_at = Some(snapshot.generated_at.clone());
        workspace.snapshot = Some(snapshot);
        bump_scene_workspace_revision(&mut workspace);
        workspace.clone()
    }

    pub fn set_error(&self, session_key: Option<&str>, error: impl Into<String>) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        if !same_session_key(workspace.session_key.as_deref(), session_key) {
            return workspace.clone();
        }
        workspace.refresh_status = SceneRefreshStatus::Error;
        workspace.error_message = Some(error.into());
        bump_scene_workspace_revision(&mut workspace);
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
        || entry.children.iter().any(|child| impacted.iter().any(|address| summary_matches_object(child, address)))
}

fn scene_children_task_impacted(task: &RuntimeSceneObjectChildrenTaskState, impacted: &[&str]) -> bool {
    impacted.contains(&task.parent_object_address.as_str())
        || task.children.iter().any(|child| impacted.iter().any(|address| summary_matches_object(child, address)))
}

fn cache_entry_impacted(entry: &SceneInspectorCacheEntry, impacted: &[&str]) -> bool {
    if impacted.iter().any(|address| summary_matches_object(&entry.header.object, address)) {
        return true;
    }

    if entry
        .header
        .parent
        .as_ref()
        .is_some_and(|parent| impacted.iter().any(|address| summary_matches_object(parent, address)))
    {
        return true;
    }

    entry.children.iter().any(|child| impacted.iter().any(|address| summary_matches_object(child, address)))
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
                && !matches!(current.status, RuntimeSceneChildrenTaskStatus::Error | RuntimeSceneChildrenTaskStatus::Cancelled)
            {
                return SceneChildrenTaskStart {
                    state: current.clone(),
                    should_spawn: false,
                };
            }
        }

        let now = crate::services::analysis::bridge_gateway::current_timestamp();
        let mut state = RuntimeSceneObjectChildrenTaskState {
            session_key: store.active_session_key.clone(),
            parent_object_address: parent_object_address.clone(),
            status: RuntimeSceneChildrenTaskStatus::Loading,
            mutation_epoch: store.mutation_epoch,
            started_at: now.clone(),
            updated_at: now,
            ..RuntimeSceneObjectChildrenTaskState::default()
        };

        if let Some(cached) = store.cache.get(&parent_object_address).cloned() {
            if cached.mutation_epoch == store.mutation_epoch {
                store.next_task_id += 1;
                state.task_id = store.next_task_id;
                state.resource_revision = bump_children_revision(&mut store);
                state.status = RuntimeSceneChildrenTaskStatus::Ready;
                state.children = cached.children.clone();
                state.total_count = cached.total_count;
                state.loaded_count = state.children.len();
                store.tasks_by_parent.insert(parent_object_address, state.clone());
                return SceneChildrenTaskStart {
                    state,
                    should_spawn: false,
                };
            }
        }

        store.next_task_id += 1;
        state.task_id = store.next_task_id;
        state.resource_revision = bump_children_revision(&mut store);
        store.tasks_by_parent.insert(parent_object_address, state.clone());
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
        current.status = RuntimeSceneChildrenTaskStatus::Cancelled;
        current.is_stale = true;
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn apply_children(
        &self,
        parent_object_address: &str,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
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
        current.children.extend(children);
        current.total_count = total_count;
        current.loaded_count = current.children.len();
        current.next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneChildrenTaskStatus::Loading
        } else {
            RuntimeSceneChildrenTaskStatus::Ready
        };
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
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
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();

        let ready_state = current.clone();
        store.cache.insert(
            parent_object_address.to_string(),
            SceneChildrenCacheEntry {
                mutation_epoch,
                children: ready_state.children.clone(),
                total_count: ready_state.total_count.max(ready_state.children.len()),
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
        current.status = RuntimeSceneChildrenTaskStatus::Error;
        current.error_message = Some(error_message);
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
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
            let impacted_refs = impacted_addresses.iter().map(String::as_str).collect::<Vec<_>>();
            store.cache.retain(|parent_object_address, entry| {
                !scene_children_cache_entry_impacted(parent_object_address, entry, &impacted_refs)
            });
        }

        let impacted_refs = impacted_addresses.iter().map(String::as_str).collect::<Vec<_>>();
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
                if !matches!(
                    task.status,
                    RuntimeSceneChildrenTaskStatus::Ready
                        | RuntimeSceneChildrenTaskStatus::Error
                        | RuntimeSceneChildrenTaskStatus::Cancelled
                ) {
                    task.status = RuntimeSceneChildrenTaskStatus::Cancelled;
                }
                task.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
            }
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneChildrenStore::default();
    }
}

impl SceneInspectorState {
    pub fn current(&self, session_key: Option<&str>) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let store = self.store.lock();
        if !same_session_key(store.active_session_key.as_deref(), session_key) {
            return None;
        }

        store.current.clone()
    }

    pub fn start_task(&self, object_address: String, session_key: Option<String>) -> SceneInspectorTaskStart {
        let mut store = self.store.lock();
        ensure_inspector_session(&mut store, session_key.as_deref());
        store.next_task_id += 1;
        let task_id = store.next_task_id;
        let now = crate::services::analysis::bridge_gateway::current_timestamp();

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
                true
            } else {
                false
            }
        } else {
            false
        };

        store.current = Some(state.clone());
        SceneInspectorTaskStart { state, use_cached }
    }

    pub fn cancel(&self, task_id: Option<u64>, session_key: Option<&str>) -> Option<RuntimeSceneObjectInspectorTaskState> {
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
        current.status = RuntimeSceneInspectorTaskStatus::Cancelled;
        current.is_stale = true;
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
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
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn apply_children(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
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
        current.children.extend(children);
        current.children_total_count = total_count;
        current.children_loaded_count = current.children.len();
        current.children_next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneInspectorTaskStatus::ChildrenLoading
        } else {
            RuntimeSceneInspectorTaskStatus::ComponentsLoading
        };
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn apply_components(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        session_key: Option<&str>,
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
        current.components.extend(components);
        current.components_total_count = total_count;
        current.components_loaded_count = current.components.len();
        current.components_next_offset = next_offset;
        current.status = if next_offset.is_some() {
            RuntimeSceneInspectorTaskStatus::ComponentsLoading
        } else {
            RuntimeSceneInspectorTaskStatus::Ready
        };
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
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
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();

        let ready_state = current.clone();
        let cache_entry = ready_state.header.clone().map(|header| {
            (
                ready_state.object_address.clone(),
                SceneInspectorCacheEntry {
                    mutation_epoch,
                    header,
                    children: ready_state.children.clone(),
                    components: ready_state.components.clone(),
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
        current.status = RuntimeSceneInspectorTaskStatus::Error;
        current.error_message = Some(error_message);
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
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
            let impacted_refs = impacted_addresses.iter().map(String::as_str).collect::<Vec<_>>();
            store.cache.retain(|object_address, entry| {
                !impacted_refs.contains(&object_address.as_str()) && !cache_entry_impacted(entry, &impacted_refs)
            });
        }

        let next_revision = store.current.is_some().then(|| bump_inspector_revision(&mut store));
        if let Some(current) = store.current.as_mut() {
            if let Some(next_revision) = next_revision {
                current.resource_revision = next_revision;
            }
            current.is_stale = true;
            if !matches!(
                current.status,
                RuntimeSceneInspectorTaskStatus::Ready | RuntimeSceneInspectorTaskStatus::Error | RuntimeSceneInspectorTaskStatus::Cancelled
            ) {
                current.status = RuntimeSceneInspectorTaskStatus::Cancelled;
            }
            current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        }
    }

    pub fn reset(&self) {
        *self.store.lock() = SceneInspectorStore::default();
    }
}