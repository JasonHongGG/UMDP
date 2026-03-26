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
    InspectSceneObject,
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

struct SceneNodeSummary {
    std::string object_address;
    std::optional<std::string> transform_address;
    std::string name;
    bool active_self = false;
    std::size_t child_count = 0;
    bool has_children = false;
    std::optional<std::size_t> component_count;
    std::optional<int> layer;
    std::optional<std::string> tag;
};

struct SceneDescriptorResponse {
    int scene_handle = 0;
    std::string name;
    bool is_loaded = true;
    std::vector<SceneNodeSummary> roots;
};

struct SceneCatalogResponse {
    std::string generated_at;
    std::vector<SceneDescriptorResponse> scenes;
};

struct SceneChildrenResponse {
    std::string parent_object_address;
    std::vector<SceneNodeSummary> children;
};

struct SceneComponentSummary {
    std::string component_address;
    std::string type_name;
};

struct SceneTransformSnapshotResponse {
    std::string transform_address;
    std::optional<Vector3Snapshot> local_position;
    std::optional<QuaternionSnapshot> local_rotation;
    std::optional<Vector3Snapshot> local_scale;
    std::optional<std::string> parent_transform_address;
    std::optional<std::string> parent_object_address;
    std::size_t child_count = 0;
};

struct SceneObjectInspectorResponse {
    std::string generated_at;
    std::optional<int> scene_handle;
    std::optional<std::string> scene_name;
    SceneNodeSummary object;
    std::optional<SceneNodeSummary> parent;
    std::vector<SceneNodeSummary> children;
    std::vector<SceneComponentSummary> components;
    std::optional<SceneTransformSnapshotResponse> transform;
};

} // namespace bridge