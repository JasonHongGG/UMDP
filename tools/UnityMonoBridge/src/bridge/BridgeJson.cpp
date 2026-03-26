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
    output << ",\"name\":\"" << JsonEscape(node.name) << "\",";
    output << "\"active_self\":" << (node.active_self ? "true" : "false") << ',';
    output << "\"child_count\":" << node.child_count << ',';
    output << "\"has_children\":" << (node.has_children ? "true" : "false") << ',';
    output << "\"component_count\":";
    WriteOptionalSize(output, node.component_count);
    output << ',';
    output << "\"layer\":";
    WriteOptionalInt(output, node.layer);
    output << ",\"tag\":";
    WriteOptionalString(output, node.tag);
    output << '}';
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
               << "\"type_name\":\"" << JsonEscape(components[index].type_name) << "\""
               << '}';
    }
}

void WriteTransformSnapshot(std::ostringstream& output, const bridge::SceneTransformSnapshotResponse& value)
{
    output << '{'
           << "\"transform_address\":\"" << JsonEscape(value.transform_address) << "\",";
    output << "\"local_position\":";
    WriteOptionalVector3(output, value.local_position);
    output << ",\"local_rotation\":";
    WriteOptionalQuaternion(output, value.local_rotation);
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
               << "\"roots\":[";
        WriteSceneNodes(output, scene.roots);
        output << "]}";
    }
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

std::string SerializeResponse(const SceneObjectInspectorResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"generated_at\":\"" << JsonEscape(response.generated_at) << "\",";
    output << "\"scene_handle\":";
    WriteOptionalInt(output, response.scene_handle);
    output << ",\"scene_name\":";
    WriteOptionalString(output, response.scene_name);
    output << ",\"object\":";
    WriteSceneNode(output, response.object);
    output << ",\"parent\":";
    if (response.parent.has_value()) {
        WriteSceneNode(output, *response.parent);
    }
    else {
        output << "null";
    }
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

} // namespace bridge