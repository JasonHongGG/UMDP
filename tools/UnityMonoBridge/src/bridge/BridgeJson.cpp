#include "bridge/BridgeJson.h"

#include <iomanip>
#include <sstream>

namespace {

std::string JsonEscape(const std::string& value)
{
    std::ostringstream stream;
    for (const char ch : value) {
        switch (ch) {
        case '\\': stream << "\\\\"; break;
        case '"': stream << "\\\""; break;
        case '\n': stream << "\\n"; break;
        case '\r': stream << "\\r"; break;
        case '\t': stream << "\\t"; break;
        default:
            if (static_cast<unsigned char>(ch) < 0x20 || static_cast<unsigned char>(ch) >= 0x7F) {
                stream << "\\u"
                       << std::hex << std::setw(4) << std::setfill('0')
                       << static_cast<int>(static_cast<unsigned char>(ch))
                       << std::dec;
            }
            else {
                stream << ch;
            }
            break;
        }
    }

    return stream.str();
}

void WriteOptionalString(std::ostringstream& output, const std::optional<std::string>& value)
{
    if (value.has_value()) {
        output << '"' << JsonEscape(*value) << '"';
    }
    else {
        output << "null";
    }
}

void WriteOptionalInt(std::ostringstream& output, const std::optional<int>& value)
{
    if (value.has_value()) {
        output << *value;
    }
    else {
        output << "null";
    }
}

void WriteOptionalSize(std::ostringstream& output, const std::optional<std::size_t>& value)
{
    if (value.has_value()) {
        output << *value;
    }
    else {
        output << "null";
    }
}

void WriteOptionalBool(std::ostringstream& output, const std::optional<bool>& value)
{
    if (value.has_value()) {
        output << (*value ? "true" : "false");
    }
    else {
        output << "null";
    }
}

void WriteFieldRows(std::ostringstream& output, const std::vector<bridge::FieldRow>& rows, bool include_runtime_values)
{
    for (std::size_t index = 0; index < rows.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        const auto& row = rows[index];
        output << '{'
               << "\"name\":\"" << JsonEscape(row.name) << "\"," 
               << "\"field_type\":\"" << JsonEscape(row.field_type) << "\"";

        output << ",\"offset\":";
        WriteOptionalString(output, row.offset);

        if (include_runtime_values) {
            output << ",\"address\":";
            WriteOptionalString(output, row.address);
            output << ",\"value\":";
            WriteOptionalString(output, row.value);
        }

        output << '}';
    }
}

void WriteInvokeValue(std::ostringstream& output, const bridge::InvokeValue& value)
{
    output << '{'
           << "\"kind\":\"" << JsonEscape(value.kind) << "\",";
    output << "\"value\":";
    WriteOptionalString(output, value.value);
    output << ",\"object_address\":";
    WriteOptionalString(output, value.object_address);
    output << '}';
}

std::string FailureKindToString(bridge::RuntimeFieldSetFailureKind kind)
{
    switch (kind) {
    case bridge::RuntimeFieldSetFailureKind::None:
        return "none";
    case bridge::RuntimeFieldSetFailureKind::FieldNotFound:
        return "field-not-found";
    case bridge::RuntimeFieldSetFailureKind::InstanceRequired:
        return "instance-required";
    case bridge::RuntimeFieldSetFailureKind::AddressMismatch:
        return "address-mismatch";
    case bridge::RuntimeFieldSetFailureKind::UnsupportedType:
        return "unsupported-type";
    case bridge::RuntimeFieldSetFailureKind::InvalidValue:
        return "invalid-value";
    case bridge::RuntimeFieldSetFailureKind::WriteFailed:
        return "write-failed";
    default:
        return "unknown";
    }
}

void WriteVector3(std::ostringstream& output, const bridge::Vector3Snapshot& value)
{
    output << '{'
           << "\"x\":" << value.x << ','
           << "\"y\":" << value.y << ','
           << "\"z\":" << value.z
           << '}';
}

void WriteQuaternion(std::ostringstream& output, const bridge::QuaternionSnapshot& value)
{
    output << '{'
           << "\"x\":" << value.x << ','
           << "\"y\":" << value.y << ','
           << "\"z\":" << value.z << ','
           << "\"w\":" << value.w
           << '}';
}

void WriteOptionalVector3(std::ostringstream& output, const std::optional<bridge::Vector3Snapshot>& value)
{
    if (value.has_value()) {
        WriteVector3(output, *value);
    }
    else {
        output << "null";
    }
}

void WriteOptionalQuaternion(std::ostringstream& output, const std::optional<bridge::QuaternionSnapshot>& value)
{
    if (value.has_value()) {
        WriteQuaternion(output, *value);
    }
    else {
        output << "null";
    }
}

void WriteSceneNode(std::ostringstream& output, const bridge::SceneNodeSummary& node)
{
    output << '{'
           << "\"object_address\":\"" << JsonEscape(node.object_address) << "\",";
    output << "\"transform_address\":";
    WriteOptionalString(output, node.transform_address);
    output << ",\"parent_object_address\":";
    WriteOptionalString(output, node.parent_object_address);
    output << ",\"name\":\"" << JsonEscape(node.name) << "\",";
    output << "\"active_self\":" << (node.active_self ? "true" : "false") << ',';
    output << "\"is_static\":";
    WriteOptionalBool(output, node.is_static);
    output << ',';
    output << "\"child_count\":" << node.child_count << ',';
    output << "\"has_children\":" << (node.has_children ? "true" : "false") << ',';
    output << "\"component_count\":";
    WriteOptionalSize(output, node.component_count);
    output << ',';
    output << "\"layer\":";
    WriteOptionalInt(output, node.layer);
    output << ",\"tag\":";
    WriteOptionalString(output, node.tag);
    output << ",\"hide_flags\":";
    WriteOptionalString(output, node.hide_flags);
    output << ",\"path\":";
    WriteOptionalString(output, node.path);
    output << '}';
}

std::string SceneKindToString(bridge::SceneKind kind)
{
    switch (kind) {
    case bridge::SceneKind::DontDestroyOnLoad:
        return "dont-destroy-on-load";
    case bridge::SceneKind::HideAndDontSave:
        return "hide-and-dont-save";
    case bridge::SceneKind::Loaded:
    default:
        return "loaded";
    }
}

void WriteSceneBuildSettingsEntries(std::ostringstream& output, const std::vector<bridge::SceneBuildSettingsEntry>& scenes)
{
    for (std::size_t index = 0; index < scenes.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        output << '{'
               << "\"build_index\":" << scenes[index].build_index << ','
               << "\"path\":\"" << JsonEscape(scenes[index].path) << "\","
               << "\"name\":\"" << JsonEscape(scenes[index].name) << "\","
               << "\"is_loaded\":" << (scenes[index].is_loaded ? "true" : "false")
               << '}';
    }
}

void WriteSceneNodes(std::ostringstream& output, const std::vector<bridge::SceneNodeSummary>& nodes)
{
    for (std::size_t index = 0; index < nodes.size(); ++index) {
        if (index > 0) {
            output << ',';
        }
        WriteSceneNode(output, nodes[index]);
    }
}

void WriteSceneComponents(std::ostringstream& output, const std::vector<bridge::SceneComponentSummary>& components)
{
    for (std::size_t index = 0; index < components.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        output << '{'
               << "\"component_address\":\"" << JsonEscape(components[index].component_address) << "\"," 
               << "\"type_name\":\"" << JsonEscape(components[index].type_name) << "\","
               << "\"is_behaviour\":" << (components[index].is_behaviour ? "true" : "false") << ',';
        output << "\"behaviour_enabled\":";
        WriteOptionalBool(output, components[index].behaviour_enabled);
        output << '}'
               ;
    }
}

void WriteHierarchyPath(std::ostringstream& output, const std::vector<bridge::SceneHierarchyPathEntry>& entries)
{
    for (std::size_t index = 0; index < entries.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        output << '{'
               << "\"object_address\":\"" << JsonEscape(entries[index].object_address) << "\","
               << "\"name\":\"" << JsonEscape(entries[index].name) << "\""
               << '}';
    }
}

std::string SceneMutationOperationToString(bridge::SceneMutationOperation operation)
{
    switch (operation) {
    case bridge::SceneMutationOperation::CreateRoot:
        return "create-root";
    case bridge::SceneMutationOperation::CreateChild:
        return "create-child";
    case bridge::SceneMutationOperation::Duplicate:
        return "duplicate";
    case bridge::SceneMutationOperation::Delete:
        return "delete";
    case bridge::SceneMutationOperation::Rename:
        return "rename";
    case bridge::SceneMutationOperation::SetTag:
        return "set-tag";
    case bridge::SceneMutationOperation::SetLayer:
        return "set-layer";
    case bridge::SceneMutationOperation::SetHideFlags:
        return "set-hide-flags";
    case bridge::SceneMutationOperation::Reparent:
        return "reparent";
    case bridge::SceneMutationOperation::SetActive:
        return "set-active";
    case bridge::SceneMutationOperation::SetTransform:
        return "set-transform";
    case bridge::SceneMutationOperation::SetBehaviourEnabled:
        return "set-behaviour-enabled";
    case bridge::SceneMutationOperation::AddComponent:
        return "add-component";
    case bridge::SceneMutationOperation::RemoveComponent:
        return "remove-component";
    case bridge::SceneMutationOperation::LoadScene:
        return "load-scene";
    default:
        return "set-active";
    }
}

void WriteTransformSnapshot(std::ostringstream& output, const bridge::SceneTransformSnapshotResponse& value)
{
    output << '{'
           << "\"transform_address\":\"" << JsonEscape(value.transform_address) << "\",";
    output << "\"world_position\":";
    WriteOptionalVector3(output, value.world_position);
    output << ",\"local_position\":";
    WriteOptionalVector3(output, value.local_position);
    output << ",\"local_rotation\":";
    WriteOptionalQuaternion(output, value.local_rotation);
    output << ",\"local_euler_angles\":";
    WriteOptionalVector3(output, value.local_euler_angles);
    output << ",\"local_scale\":";
    WriteOptionalVector3(output, value.local_scale);
    output << ",\"parent_transform_address\":";
    WriteOptionalString(output, value.parent_transform_address);
    output << ",\"parent_object_address\":";
    WriteOptionalString(output, value.parent_object_address);
    output << ",\"child_count\":" << value.child_count;
    output << '}';
}

} // namespace

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response)
{
    std::ostringstream output;
    output << "{\"static_fields\":[";
    WriteFieldRows(output, response.static_fields, true);
    output << "],\"fields\":[";
    WriteFieldRows(output, response.fields, true);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const RuntimeMethodInvokeResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"success\":" << (response.success ? "true" : "false") << ','
           << "\"method_name\":\"" << JsonEscape(response.method_name) << "\"," 
           << "\"method_signature\":\"" << JsonEscape(response.method_signature) << "\"," 
           << "\"return_type\":\"" << JsonEscape(response.return_type) << "\",";
    output << "\"error\":";
    WriteOptionalString(output, response.error);
    output << ",\"exception\":";
    WriteOptionalString(output, response.exception);
    output << ",\"result\":";
    if (response.result.has_value()) {
        WriteInvokeValue(output, *response.result);
    }
    else {
        output << "null";
    }
    output << '}';
    return output.str();
}

std::string SerializeResponse(const RuntimeFieldSetResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"success\":" << (response.success ? "true" : "false") << ','
           << "\"failure_kind\":\"" << JsonEscape(FailureKindToString(response.failure_kind)) << "\"," 
           << "\"field_name\":\"" << JsonEscape(response.field_name) << "\"," 
           << "\"field_type\":\"" << JsonEscape(response.field_type) << "\"," 
           << "\"is_static\":" << (response.is_static ? "true" : "false") << ',';
    output << "\"address\":";
    WriteOptionalString(output, response.address);
    output << ",\"error\":";
    WriteOptionalString(output, response.error);
    output << ",\"previous_value\":";
    WriteOptionalString(output, response.previous_value);
    output << ",\"applied_value\":";
    WriteOptionalString(output, response.applied_value);
    output << '}';
    return output.str();
}

std::string SerializeResponse(const SceneCatalogResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"scenes\":[";
    for (std::size_t index = 0; index < response.scenes.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        const auto& scene = response.scenes[index];
        output << '{'
               << "\"scene_handle\":" << scene.scene_handle << ','
               << "\"name\":\"" << JsonEscape(scene.name) << "\"," 
               << "\"is_loaded\":" << (scene.is_loaded ? "true" : "false") << ','
               << "\"kind\":\"" << JsonEscape(SceneKindToString(scene.kind)) << "\",";
        output << "\"build_index\":";
        WriteOptionalInt(output, scene.build_index);
        output << ",\"path\":";
        WriteOptionalString(output, scene.path);
        output << ",\"roots\":[";
        WriteSceneNodes(output, scene.roots);
        output << "]}";
    }
    output << "],\"build_settings_scenes\":[";
    WriteSceneBuildSettingsEntries(output, response.build_settings_scenes);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const SceneChildrenResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"parent_object_address\":\"" << JsonEscape(response.parent_object_address) << "\",";
    output << "\"children\":[";
    WriteSceneNodes(output, response.children);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const SceneChildrenPageResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"parent_object_address\":\"" << JsonEscape(response.parent_object_address) << "\",";
    output << "\"offset\":" << response.offset << ',';
    output << "\"total_count\":" << response.total_count << ',';
    output << "\"next_offset\":";
    WriteOptionalSize(output, response.next_offset);
    output << ",\"children\":[";
    WriteSceneNodes(output, response.children);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const SceneComponentsPageResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"object_address\":\"" << JsonEscape(response.object_address) << "\",";
    output << "\"offset\":" << response.offset << ',';
    output << "\"total_count\":" << response.total_count << ',';
    output << "\"next_offset\":";
    WriteOptionalSize(output, response.next_offset);
    output << ",\"components\":[";
    WriteSceneComponents(output, response.components);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const SceneObjectInspectorHeaderResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"scene_handle\":";
    WriteOptionalInt(output, response.scene_handle);
    output << ",\"scene_name\":";
    WriteOptionalString(output, response.scene_name);
    output << ",\"scene_kind\":";
    if (response.scene_kind.has_value()) {
        output << "\"" << JsonEscape(SceneKindToString(*response.scene_kind)) << "\"";
    }
    else {
        output << "null";
    }
    output << ",\"object\":";
    WriteSceneNode(output, response.object);
    output << ",\"parent\":";
    if (response.parent.has_value()) {
        WriteSceneNode(output, *response.parent);
    }
    else {
        output << "null";
    }
    output << ",\"hierarchy_path\":[";
    WriteHierarchyPath(output, response.hierarchy_path);
    output << ']';
    output << ",\"transform\":";
    if (response.transform.has_value()) {
        WriteTransformSnapshot(output, *response.transform);
    }
    else {
        output << "null";
    }
    output << '}';
    return output.str();
}

std::string SerializeResponse(const SceneObjectInspectorResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"scene_handle\":";
    WriteOptionalInt(output, response.scene_handle);
    output << ",\"scene_name\":";
    WriteOptionalString(output, response.scene_name);
    output << ",\"scene_kind\":";
    if (response.scene_kind.has_value()) {
        output << "\"" << JsonEscape(SceneKindToString(*response.scene_kind)) << "\"";
    }
    else {
        output << "null";
    }
    output << ",\"object\":";
    WriteSceneNode(output, response.object);
    output << ",\"parent\":";
    if (response.parent.has_value()) {
        WriteSceneNode(output, *response.parent);
    }
    else {
        output << "null";
    }
    output << ",\"hierarchy_path\":[";
    WriteHierarchyPath(output, response.hierarchy_path);
    output << "]";
    output << ",\"children\":[";
    WriteSceneNodes(output, response.children);
    output << "],\"components\":[";
    WriteSceneComponents(output, response.components);
    output << "],\"transform\":";
    if (response.transform.has_value()) {
        WriteTransformSnapshot(output, *response.transform);
    }
    else {
        output << "null";
    }
    output << '}';
    return output.str();
}

std::string SerializeResponse(const SceneMutationResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"operation\":\"" << JsonEscape(SceneMutationOperationToString(response.operation)) << "\",";
    output << "\"scene_handle\":";
    WriteOptionalInt(output, response.scene_handle);
    output << ",\"target_object_address\":";
    WriteOptionalString(output, response.target_object_address);
    output << ",\"parent_object_address\":";
    WriteOptionalString(output, response.parent_object_address);
    output << ",\"object\":";
    if (response.object.has_value()) {
        WriteSceneNode(output, *response.object);
    }
    else {
        output << "null";
    }
    output << ",\"deleted_object_address\":";
    WriteOptionalString(output, response.deleted_object_address);
    output << ",\"preferred_selection_address\":";
    WriteOptionalString(output, response.preferred_selection_address);
    output << ",\"preferred_selection_hint\":";
    if (response.preferred_selection_hint.has_value()) {
        output << '{';
        output << "\"scene_handle\":";
        WriteOptionalInt(output, response.preferred_selection_hint->scene_handle);
        output << ",\"object_address\":\"" << JsonEscape(response.preferred_selection_hint->object_address) << "\",";
        output << "\"ancestor_object_addresses\":[";
        for (std::size_t index = 0; index < response.preferred_selection_hint->ancestor_object_addresses.size(); ++index) {
            if (index > 0) {
                output << ',';
            }
            output << "\"" << JsonEscape(response.preferred_selection_hint->ancestor_object_addresses[index]) << "\"";
        }
        output << "]}";
    }
    else {
        output << "null";
    }
    output << ",\"active_self\":";
    WriteOptionalBool(output, response.active_self);
    output << ",\"tag\":";
    WriteOptionalString(output, response.tag);
    output << ",\"layer\":";
    WriteOptionalInt(output, response.layer);
    output << ",\"hide_flags\":";
    WriteOptionalString(output, response.hide_flags);
    output << ",\"behaviour_enabled\":";
    WriteOptionalBool(output, response.behaviour_enabled);
    output << ",\"hierarchy_path\":[";
    WriteHierarchyPath(output, response.hierarchy_path);
    output << ']';
    output << ",\"transform\":";
    if (response.transform.has_value()) {
        WriteTransformSnapshot(output, *response.transform);
    }
    else {
        output << "null";
    }
    output << '}';
    return output.str();
}

} // namespace bridge