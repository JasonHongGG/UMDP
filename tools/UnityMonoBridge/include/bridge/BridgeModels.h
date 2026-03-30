#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge {

enum class BridgeOperation {
    InspectClass,
    InvokeMethod,
    SetField,
    LoadSceneCatalog,
    LoadSceneChildren,
    LoadSceneChildrenPage,
    InspectSceneObject,
    InspectSceneObjectHeader,
    InspectSceneObjectChildrenPage,
    InspectSceneObjectComponentsPage,
    CreateSceneRoot,
    CreateSceneChild,
    DuplicateSceneObject,
    DeleteSceneObject,
    RenameSceneObject,
    SetSceneObjectTag,
    SetSceneObjectLayer,
    SetSceneObjectHideFlags,
    ReparentSceneObject,
    SetSceneObjectActive,
    SetSceneObjectTransform,
    SetSceneBehaviourEnabled,
    CreateSceneComponent,
    DeleteSceneComponent,
    LoadSceneByBuildIndex,
};

enum class SceneKind {
    Loaded,
    DontDestroyOnLoad,
    HideAndDontSave,
};

enum class InvokeValueKind {
    Null,
    Boolean,
    Number,
    String,
    Address,
};

struct InvokeArgument {
    InvokeValueKind kind = InvokeValueKind::Null;
    std::optional<std::string> value;
};

struct InvokeValue {
    std::string kind;
    std::optional<std::string> value;
    std::optional<std::string> object_address;
};

enum class FieldValueKind {
    Null,
    Boolean,
    Integer,
    Float,
    String,
    Address,
};

enum class RuntimeFieldSetFailureKind {
    None,
    FieldNotFound,
    InstanceRequired,
    AddressMismatch,
    UnsupportedType,
    InvalidValue,
    WriteFailed,
    Unknown,
};

struct Vector3Snapshot {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
};

struct QuaternionSnapshot {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
    float w = 0.0f;
};

struct BridgeRequest {
    BridgeOperation operation = BridgeOperation::InspectClass;
    std::size_t pid = 0;
    std::string image_name;
    std::string class_namespace;
    std::string class_name;
    std::optional<Address> instance_address;
    std::string method_name;
    std::string method_signature;
    std::vector<InvokeArgument> arguments;
    std::string field_name;
    std::string field_type_name;
    bool field_is_static = false;
    std::optional<Address> target_address;
    FieldValueKind field_value_kind = FieldValueKind::Null;
    std::optional<std::string> field_value;
    std::optional<Address> object_address;
    std::optional<Address> component_address;
    std::optional<Address> parent_object_address;
    std::optional<std::string> object_name;
    std::optional<std::string> object_path;
    std::optional<std::string> component_type_name;
    std::optional<std::string> tag;
    std::optional<std::string> hide_flags;
    std::optional<bool> active_self;
    std::optional<bool> behaviour_enabled;
    std::optional<int> layer;
    std::optional<int> scene_handle;
    std::optional<int> build_index;
    std::optional<std::size_t> offset;
    std::optional<std::size_t> limit;
    std::optional<Vector3Snapshot> world_position;
    std::optional<Vector3Snapshot> local_position;
    std::optional<QuaternionSnapshot> local_rotation;
    std::optional<Vector3Snapshot> local_euler_angles;
    std::optional<Vector3Snapshot> local_scale;
};

struct FieldRow {
    std::string name;
    std::string field_type;
    std::optional<std::string> address;
    std::optional<std::string> value;
    std::optional<std::string> offset;
};

struct RuntimeClassOverlayResponse {
    std::vector<FieldRow> static_fields;
    std::vector<FieldRow> fields;
};

struct RuntimeMethodInvokeResponse {
    bool success = false;
    std::string method_name;
    std::string method_signature;
    std::string return_type;
    std::optional<std::string> error;
    std::optional<std::string> exception;
    std::optional<InvokeValue> result;
};

struct RuntimeFieldSetResponse {
    bool success = false;
    RuntimeFieldSetFailureKind failure_kind = RuntimeFieldSetFailureKind::Unknown;
    std::string field_name;
    std::string field_type;
    bool is_static = false;
    std::optional<std::string> address;
    std::optional<std::string> error;
    std::optional<std::string> previous_value;
    std::optional<std::string> applied_value;
};

struct SceneNodeSummary {
    std::string object_address;
    std::optional<std::string> transform_address;
    std::optional<std::string> parent_object_address;
    std::string name;
    bool active_self = false;
    std::size_t child_count = 0;
    bool has_children = false;
    std::optional<std::size_t> component_count;
    std::optional<int> layer;
    std::optional<std::string> tag;
    std::optional<std::string> hide_flags;
    std::optional<std::string> path;
};

struct SceneBuildSettingsEntry {
    int build_index = -1;
    std::string path;
    std::string name;
    bool is_loaded = false;
};

struct SceneDescriptorResponse {
    int scene_handle = 0;
    std::string name;
    bool is_loaded = true;
    SceneKind kind = SceneKind::Loaded;
    std::optional<int> build_index;
    std::optional<std::string> path;
    std::vector<SceneNodeSummary> roots;
};

struct SceneCatalogResponse {
    std::string generated_at;
    std::vector<SceneDescriptorResponse> scenes;
    std::vector<SceneBuildSettingsEntry> build_settings_scenes;
};

struct SceneChildrenResponse {
    std::string parent_object_address;
    std::vector<SceneNodeSummary> children;
};

struct SceneChildrenPageResponse {
    std::string generated_at;
    std::string parent_object_address;
    std::size_t offset = 0;
    std::size_t total_count = 0;
    std::optional<std::size_t> next_offset;
    std::vector<SceneNodeSummary> children;
};

struct SceneComponentSummary {
    std::string component_address;
    std::string type_name;
    bool is_behaviour = false;
    std::optional<bool> behaviour_enabled;
};

struct SceneHierarchyPathEntry {
    std::string object_address;
    std::string name;
};

struct SceneComponentsPageResponse {
    std::string generated_at;
    std::string object_address;
    std::size_t offset = 0;
    std::size_t total_count = 0;
    std::optional<std::size_t> next_offset;
    std::vector<SceneComponentSummary> components;
};

struct SceneTransformSnapshotResponse {
    std::string transform_address;
    std::optional<Vector3Snapshot> world_position;
    std::optional<Vector3Snapshot> local_position;
    std::optional<QuaternionSnapshot> local_rotation;
    std::optional<Vector3Snapshot> local_euler_angles;
    std::optional<Vector3Snapshot> local_scale;
    std::optional<std::string> parent_transform_address;
    std::optional<std::string> parent_object_address;
    std::size_t child_count = 0;
};

struct SceneObjectInspectorResponse {
    std::string generated_at;
    std::optional<int> scene_handle;
    std::optional<std::string> scene_name;
    std::optional<SceneKind> scene_kind;
    SceneNodeSummary object;
    std::optional<SceneNodeSummary> parent;
    std::vector<SceneHierarchyPathEntry> hierarchy_path;
    std::vector<SceneNodeSummary> children;
    std::vector<SceneComponentSummary> components;
    std::optional<SceneTransformSnapshotResponse> transform;
};

struct SceneObjectInspectorHeaderResponse {
    std::string generated_at;
    std::optional<int> scene_handle;
    std::optional<std::string> scene_name;
    std::optional<SceneKind> scene_kind;
    SceneNodeSummary object;
    std::optional<SceneNodeSummary> parent;
    std::vector<SceneHierarchyPathEntry> hierarchy_path;
    std::optional<SceneTransformSnapshotResponse> transform;
};

enum class SceneMutationOperation {
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
};

struct SceneSelectionHint {
    std::optional<int> scene_handle;
    std::string object_address;
    std::vector<std::string> ancestor_object_addresses;
};

struct SceneMutationResponse {
    SceneMutationOperation operation = SceneMutationOperation::SetActive;
    std::optional<int> scene_handle;
    std::optional<std::string> target_object_address;
    std::optional<std::string> parent_object_address;
    std::optional<SceneNodeSummary> object;
    std::optional<std::string> deleted_object_address;
    std::optional<std::string> preferred_selection_address;
    std::optional<SceneSelectionHint> preferred_selection_hint;
    std::optional<bool> active_self;
    std::optional<std::string> tag;
    std::optional<int> layer;
    std::optional<std::string> hide_flags;
    std::optional<bool> behaviour_enabled;
    std::vector<SceneHierarchyPathEntry> hierarchy_path;
    std::optional<SceneTransformSnapshotResponse> transform;
};

} // namespace bridge