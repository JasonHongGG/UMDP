use crate::domain::analysis_models::{
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenTaskStatus,
    RuntimeSceneComponentSummary, RuntimeSceneInspectorTaskStatus,
    RuntimeSceneNodeSummary, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectInspectorHeaderSnapshot, RuntimeSceneObjectInspectorTaskState,
    SceneRefreshStatus, SceneWorkspaceState,
};
use parking_lot::Mutex;
use std::collections::HashMap;

#[derive(Default)]
pub struct SceneState {
    workspace: Mutex<SceneWorkspaceState>,
}

impl SceneState {
    pub fn current(&self) -> SceneWorkspaceState {
        self.workspace.lock().clone()
    }

    pub fn set_refreshing(&self) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        workspace.refresh_status = SceneRefreshStatus::Refreshing;
        workspace.error_message = None;
        workspace.clone()
    }

    pub fn set_snapshot(&self, snapshot: RuntimeSceneCatalogSnapshot) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        workspace.refresh_status = SceneRefreshStatus::Ready;
        workspace.error_message = None;
        workspace.last_updated_at = Some(snapshot.generated_at.clone());
        workspace.snapshot = Some(snapshot);
        workspace.clone()
    }

    pub fn set_error(&self, error: impl Into<String>) -> SceneWorkspaceState {
        let mut workspace = self.workspace.lock();
        workspace.refresh_status = SceneRefreshStatus::Error;
        workspace.error_message = Some(error.into());
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
    tasks_by_parent: HashMap<String, RuntimeSceneObjectChildrenTaskState>,
    cache: HashMap<String, SceneChildrenCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
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
    current: Option<RuntimeSceneObjectInspectorTaskState>,
    cache: HashMap<String, SceneInspectorCacheEntry>,
    next_task_id: u64,
    mutation_epoch: u64,
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

impl SceneChildrenState {
    pub fn current(&self, parent_object_address: &str) -> Option<RuntimeSceneObjectChildrenTaskState> {
        self.store.lock().tasks_by_parent.get(parent_object_address).cloned()
    }

    pub fn start_task(&self, parent_object_address: String) -> SceneChildrenTaskStart {
        let mut store = self.store.lock();

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
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        if task_id.is_some_and(|value| value != current.task_id) {
            return Some(current.clone());
        }

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
        children: Vec<RuntimeSceneNodeSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

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
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

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
        error_message: String,
    ) -> Option<RuntimeSceneObjectChildrenTaskState> {
        let mut store = self.store.lock();
        let current = store.tasks_by_parent.get_mut(parent_object_address)?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

        current.status = RuntimeSceneChildrenTaskStatus::Error;
        current.error_message = Some(error_message);
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn invalidate_related(&self, impacted_addresses: &[String]) {
        let mut store = self.store.lock();
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
        for task in store.tasks_by_parent.values_mut() {
            if impacted_addresses.is_empty() || scene_children_task_impacted(task, &impacted_refs) {
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
    pub fn current(&self) -> Option<RuntimeSceneObjectInspectorTaskState> {
        self.store.lock().current.clone()
    }

    pub fn start_task(&self, object_address: String) -> SceneInspectorTaskStart {
        let mut store = self.store.lock();
        store.next_task_id += 1;
        let task_id = store.next_task_id;
        let now = crate::services::analysis::bridge_gateway::current_timestamp();

        let mut state = RuntimeSceneObjectInspectorTaskState {
            task_id,
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

    pub fn cancel(&self, task_id: Option<u64>) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if task_id.is_some_and(|value| value != current.task_id) {
            return Some(current.clone());
        }

        current.status = RuntimeSceneInspectorTaskStatus::Cancelled;
        current.is_stale = true;
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn apply_header(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        header: RuntimeSceneObjectInspectorHeaderSnapshot,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

        current.header = Some(header);
        current.status = RuntimeSceneInspectorTaskStatus::ChildrenLoading;
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn apply_children(
        &self,
        task_id: u64,
        mutation_epoch: u64,
        children: Vec<RuntimeSceneNodeSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

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
        components: Vec<RuntimeSceneComponentSummary>,
        total_count: usize,
        next_offset: Option<usize>,
    ) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

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

    pub fn complete(&self, task_id: u64, mutation_epoch: u64) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

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

    pub fn fail(&self, task_id: u64, mutation_epoch: u64, error_message: String) -> Option<RuntimeSceneObjectInspectorTaskState> {
        let mut store = self.store.lock();
        let current = store.current.as_mut()?;
        if current.task_id != task_id || current.mutation_epoch != mutation_epoch {
            return None;
        }

        current.status = RuntimeSceneInspectorTaskStatus::Error;
        current.error_message = Some(error_message);
        current.updated_at = crate::services::analysis::bridge_gateway::current_timestamp();
        Some(current.clone())
    }

    pub fn invalidate_related(&self, impacted_addresses: &[String]) {
        let mut store = self.store.lock();
        store.mutation_epoch += 1;

        if impacted_addresses.is_empty() {
            store.cache.clear();
        } else {
            let impacted_refs = impacted_addresses.iter().map(String::as_str).collect::<Vec<_>>();
            store.cache.retain(|object_address, entry| {
                !impacted_refs.contains(&object_address.as_str()) && !cache_entry_impacted(entry, &impacted_refs)
            });
        }

        if let Some(current) = store.current.as_mut() {
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