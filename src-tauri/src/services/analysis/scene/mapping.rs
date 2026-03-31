use crate::domain::analysis_models::{
    RuntimeQuaternionSnapshot, RuntimeSceneBuildSettingsEntry,
    RuntimeSceneComponentSummary, RuntimeSceneDescriptor,
    RuntimeSceneHierarchyPathEntry, RuntimeSceneKind,
    RuntimeSceneMutationOperation, RuntimeSceneMutationResult,
    RuntimeSceneNodeSummary, RuntimeSceneSelectionHint,
    RuntimeSceneTransformSnapshot, RuntimeVector3Snapshot,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneNodeSummary {
    pub object_address: String,
    pub transform_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub name: String,
    pub active_self: bool,
    pub is_static: Option<bool>,
    pub child_count: usize,
    pub has_children: bool,
    pub component_count: Option<usize>,
    pub layer: Option<i32>,
    pub tag: Option<String>,
    pub hide_flags: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum HelperSceneKind {
    Loaded,
    DontDestroyOnLoad,
    HideAndDontSave,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneBuildSettingsEntry {
    pub build_index: i32,
    pub path: String,
    pub name: String,
    pub is_loaded: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneDescriptor {
    pub scene_handle: i32,
    pub name: String,
    pub is_loaded: bool,
    pub kind: HelperSceneKind,
    pub build_index: Option<i32>,
    pub path: Option<String>,
    pub roots: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneCatalogResponse {
    pub generated_at: String,
    pub scenes: Vec<HelperSceneDescriptor>,
    pub build_settings_scenes: Vec<HelperSceneBuildSettingsEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneChildrenResponse {
    pub parent_object_address: String,
    pub children: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneComponentSummary {
    pub component_address: String,
    pub type_name: String,
    pub is_behaviour: bool,
    pub behaviour_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneHierarchyPathEntry {
    pub object_address: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperVector3Snapshot {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperQuaternionSnapshot {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneTransformSnapshot {
    pub transform_address: String,
    pub world_position: Option<HelperVector3Snapshot>,
    pub local_position: Option<HelperVector3Snapshot>,
    pub local_rotation: Option<HelperQuaternionSnapshot>,
    pub local_euler_angles: Option<HelperVector3Snapshot>,
    pub local_scale: Option<HelperVector3Snapshot>,
    pub parent_transform_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub child_count: usize,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneInspectorResponse {
    pub generated_at: String,
    pub scene_handle: Option<i32>,
    pub scene_name: Option<String>,
    pub scene_kind: Option<HelperSceneKind>,
    pub object: HelperSceneNodeSummary,
    pub parent: Option<HelperSceneNodeSummary>,
    pub hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    pub children: Vec<HelperSceneNodeSummary>,
    pub components: Vec<HelperSceneComponentSummary>,
    pub transform: Option<HelperSceneTransformSnapshot>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneInspectorHeaderResponse {
    pub generated_at: String,
    pub scene_handle: Option<i32>,
    pub scene_name: Option<String>,
    pub scene_kind: Option<HelperSceneKind>,
    pub object: HelperSceneNodeSummary,
    pub parent: Option<HelperSceneNodeSummary>,
    pub hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    pub transform: Option<HelperSceneTransformSnapshot>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneChildrenPageResponse {
    pub generated_at: String,
    pub parent_object_address: String,
    pub offset: usize,
    pub total_count: usize,
    pub next_offset: Option<usize>,
    pub children: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneComponentsPageResponse {
    pub generated_at: String,
    pub object_address: String,
    pub offset: usize,
    pub total_count: usize,
    pub next_offset: Option<usize>,
    pub components: Vec<HelperSceneComponentSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum HelperSceneMutationOperation {
    CreateRoot,
    CreateChild,
    Duplicate,
    Delete,
    Rename,
    SetTag,
    SetLayer,
    SetHideFlags,
    Reparent,
    SetActive,
    SetTransform,
    SetBehaviourEnabled,
    AddComponent,
    RemoveComponent,
    LoadScene,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneSelectionHint {
    pub scene_handle: Option<i32>,
    pub object_address: String,
    pub ancestor_object_addresses: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct HelperSceneMutationResponse {
    pub operation: HelperSceneMutationOperation,
    pub scene_handle: Option<i32>,
    pub target_object_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub object: Option<HelperSceneNodeSummary>,
    pub deleted_object_address: Option<String>,
    pub preferred_selection_address: Option<String>,
    pub preferred_selection_hint: Option<HelperSceneSelectionHint>,
    pub active_self: Option<bool>,
    pub tag: Option<String>,
    pub layer: Option<i32>,
    pub hide_flags: Option<String>,
    pub behaviour_enabled: Option<bool>,
    pub hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    pub transform: Option<HelperSceneTransformSnapshot>,
}

pub(super) fn map_scene_descriptor(value: HelperSceneDescriptor) -> RuntimeSceneDescriptor {
    RuntimeSceneDescriptor {
        scene_handle: value.scene_handle,
        name: value.name,
        is_loaded: value.is_loaded,
        kind: map_scene_kind(value.kind),
        build_index: value.build_index,
        path: value.path,
        roots: value.roots.into_iter().map(map_scene_node_summary).collect(),
    }
}

pub(super) fn map_scene_kind(value: HelperSceneKind) -> RuntimeSceneKind {
    match value {
        HelperSceneKind::Loaded => RuntimeSceneKind::Loaded,
        HelperSceneKind::DontDestroyOnLoad => RuntimeSceneKind::DontDestroyOnLoad,
        HelperSceneKind::HideAndDontSave => RuntimeSceneKind::HideAndDontSave,
    }
}

pub(super) fn map_scene_build_settings_entry(
    value: HelperSceneBuildSettingsEntry,
) -> RuntimeSceneBuildSettingsEntry {
    RuntimeSceneBuildSettingsEntry {
        build_index: value.build_index,
        path: value.path,
        name: value.name,
        is_loaded: value.is_loaded,
    }
}

pub(super) fn map_scene_node_summary(value: HelperSceneNodeSummary) -> RuntimeSceneNodeSummary {
    RuntimeSceneNodeSummary {
        object_address: value.object_address,
        transform_address: value.transform_address,
        parent_object_address: value.parent_object_address,
        name: value.name,
        active_self: value.active_self,
        is_static: value.is_static,
        child_count: value.child_count,
        has_children: value.has_children,
        component_count: value.component_count,
        layer: value.layer,
        tag: value.tag,
        hide_flags: value.hide_flags,
        path: value.path,
    }
}

pub(super) fn map_scene_component(
    value: HelperSceneComponentSummary,
) -> RuntimeSceneComponentSummary {
    RuntimeSceneComponentSummary {
        component_address: value.component_address,
        type_name: value.type_name,
        is_behaviour: value.is_behaviour,
        behaviour_enabled: value.behaviour_enabled,
    }
}

pub(super) fn map_hierarchy_path_entry(
    value: HelperSceneHierarchyPathEntry,
) -> RuntimeSceneHierarchyPathEntry {
    RuntimeSceneHierarchyPathEntry {
        object_address: value.object_address,
        name: value.name,
    }
}

fn map_vector3(value: HelperVector3Snapshot) -> RuntimeVector3Snapshot {
    RuntimeVector3Snapshot {
        x: value.x,
        y: value.y,
        z: value.z,
    }
}

fn map_quaternion(value: HelperQuaternionSnapshot) -> RuntimeQuaternionSnapshot {
    RuntimeQuaternionSnapshot {
        x: value.x,
        y: value.y,
        z: value.z,
        w: value.w,
    }
}

pub(super) fn map_transform_snapshot(
    value: HelperSceneTransformSnapshot,
) -> RuntimeSceneTransformSnapshot {
    RuntimeSceneTransformSnapshot {
        transform_address: value.transform_address,
        world_position: value.world_position.map(map_vector3),
        local_position: value.local_position.map(map_vector3),
        local_rotation: value.local_rotation.map(map_quaternion),
        local_euler_angles: value.local_euler_angles.map(map_vector3),
        local_scale: value.local_scale.map(map_vector3),
        parent_transform_address: value.parent_transform_address,
        parent_object_address: value.parent_object_address,
        child_count: value.child_count,
    }
}

fn map_selection_hint(value: HelperSceneSelectionHint) -> RuntimeSceneSelectionHint {
    RuntimeSceneSelectionHint {
        scene_handle: value.scene_handle,
        object_address: value.object_address,
        ancestor_object_addresses: value.ancestor_object_addresses,
    }
}

pub(super) fn map_scene_mutation(
    value: HelperSceneMutationResponse,
) -> RuntimeSceneMutationResult {
    RuntimeSceneMutationResult {
        operation: match value.operation {
            HelperSceneMutationOperation::CreateRoot => {
                RuntimeSceneMutationOperation::CreateRoot
            }
            HelperSceneMutationOperation::CreateChild => {
                RuntimeSceneMutationOperation::CreateChild
            }
            HelperSceneMutationOperation::Duplicate => {
                RuntimeSceneMutationOperation::Duplicate
            }
            HelperSceneMutationOperation::Delete => RuntimeSceneMutationOperation::Delete,
            HelperSceneMutationOperation::Rename => RuntimeSceneMutationOperation::Rename,
            HelperSceneMutationOperation::SetTag => RuntimeSceneMutationOperation::SetTag,
            HelperSceneMutationOperation::SetLayer => {
                RuntimeSceneMutationOperation::SetLayer
            }
            HelperSceneMutationOperation::SetHideFlags => {
                RuntimeSceneMutationOperation::SetHideFlags
            }
            HelperSceneMutationOperation::Reparent => {
                RuntimeSceneMutationOperation::Reparent
            }
            HelperSceneMutationOperation::SetActive => {
                RuntimeSceneMutationOperation::SetActive
            }
            HelperSceneMutationOperation::SetTransform => {
                RuntimeSceneMutationOperation::SetTransform
            }
            HelperSceneMutationOperation::SetBehaviourEnabled => {
                RuntimeSceneMutationOperation::SetBehaviourEnabled
            }
            HelperSceneMutationOperation::AddComponent => {
                RuntimeSceneMutationOperation::AddComponent
            }
            HelperSceneMutationOperation::RemoveComponent => {
                RuntimeSceneMutationOperation::RemoveComponent
            }
            HelperSceneMutationOperation::LoadScene => {
                RuntimeSceneMutationOperation::LoadScene
            }
        },
        scene_handle: value.scene_handle,
        target_object_address: value.target_object_address,
        parent_object_address: value.parent_object_address,
        object: value.object.map(map_scene_node_summary),
        deleted_object_address: value.deleted_object_address,
        preferred_selection_address: value.preferred_selection_address,
        preferred_selection_hint: value.preferred_selection_hint.map(map_selection_hint),
        active_self: value.active_self,
        tag: value.tag,
        layer: value.layer,
        hide_flags: value.hide_flags,
        behaviour_enabled: value.behaviour_enabled,
        hierarchy_path: value
            .hierarchy_path
            .into_iter()
            .map(map_hierarchy_path_entry)
            .collect(),
        transform: value.transform.map(map_transform_snapshot),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::analysis::bridge_gateway::current_timestamp;

    #[test]
    fn mapping_preserves_scene_node_shape() {
        let mapped = map_scene_node_summary(HelperSceneNodeSummary {
            object_address: "0x10".into(),
            transform_address: Some("0x20".into()),
            parent_object_address: Some("0x01".into()),
            name: "Player".into(),
            active_self: true,
            is_static: Some(false),
            child_count: 2,
            has_children: true,
            component_count: Some(3),
            layer: Some(0),
            tag: Some("Player".into()),
            hide_flags: Some("None".into()),
            path: Some("GameplayRoot/Player".into()),
        });

        assert_eq!(mapped.object_address, "0x10");
        assert_eq!(mapped.transform_address.as_deref(), Some("0x20"));
        assert!(mapped.has_children);
        assert_eq!(mapped.component_count, Some(3));
    }

    #[test]
    fn scene_workspace_timestamp_stays_string_based() {
        let timestamp = current_timestamp();
        assert!(timestamp.parse::<u64>().is_ok());
    }
}