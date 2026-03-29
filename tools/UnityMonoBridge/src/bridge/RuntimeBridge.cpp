#include "bridge/RuntimeBridge.h"

#include "runtime/services/RuntimeInspector.h"

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace bridge {

namespace {

using PerfClock = std::chrono::steady_clock;

void LogScenePerf(const char* label, PerfClock::time_point started_at, const std::string& details)
{
    std::cerr << "[perf][RuntimeBridge] " << label << " completed in "
              << std::chrono::duration_cast<std::chrono::milliseconds>(PerfClock::now() - started_at).count()
              << "ms " << details << std::endl;
}

template <typename TValue>
TValue ParseUnsignedValue(const std::string& value)
{
    return static_cast<TValue>(std::stoull(value, nullptr, 0));
}

float ParseFloatValue(const std::string& value)
{
    return std::stof(value);
}

InvokeValueKind ParseInvokeValueKind(const std::string& value)
{
    if (value == "boolean") {
        return InvokeValueKind::Boolean;
    }
    if (value == "number") {
        return InvokeValueKind::Number;
    }
    if (value == "string") {
        return InvokeValueKind::String;
    }
    if (value == "address") {
        return InvokeValueKind::Address;
    }

    return InvokeValueKind::Null;
}

FieldValueKind ParseFieldValueKind(const std::string& value)
{
    if (value == "boolean") {
        return FieldValueKind::Boolean;
    }
    if (value == "integer") {
        return FieldValueKind::Integer;
    }
    if (value == "float") {
        return FieldValueKind::Float;
    }
    if (value == "string") {
        return FieldValueKind::String;
    }
    if (value == "address") {
        return FieldValueKind::Address;
    }

    return FieldValueKind::Null;
}

BridgeRequest ParseTokens(const std::vector<std::string>& tokens)
{
    BridgeRequest request;
    for (std::size_t index = 0; index + 1 < tokens.size(); index += 2) {
        const std::string& key = tokens[index];
        const std::string& value = tokens[index + 1];

        if (key == "--pid") {
            request.pid = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--operation") {
            if (value == "invoke") {
                request.operation = BridgeOperation::InvokeMethod;
            }
            else if (value == "set-field") {
                request.operation = BridgeOperation::SetField;
            }
            else if (value == "scene-catalog") {
                request.operation = BridgeOperation::LoadSceneCatalog;
            }
            else if (value == "scene-children") {
                request.operation = BridgeOperation::LoadSceneChildren;
            }
            else if (value == "scene-children-page") {
                request.operation = BridgeOperation::LoadSceneChildrenPage;
            }
            else if (value == "scene-inspect") {
                request.operation = BridgeOperation::InspectSceneObject;
            }
            else if (value == "scene-inspect-header") {
                request.operation = BridgeOperation::InspectSceneObjectHeader;
            }
            else if (value == "scene-inspect-children-page") {
                request.operation = BridgeOperation::InspectSceneObjectChildrenPage;
            }
            else if (value == "scene-inspect-components-page") {
                request.operation = BridgeOperation::InspectSceneObjectComponentsPage;
            }
            else if (value == "scene-create-child") {
                request.operation = BridgeOperation::CreateSceneChild;
            }
            else if (value == "scene-duplicate") {
                request.operation = BridgeOperation::DuplicateSceneObject;
            }
            else if (value == "scene-delete") {
                request.operation = BridgeOperation::DeleteSceneObject;
            }
            else if (value == "scene-set-active") {
                request.operation = BridgeOperation::SetSceneObjectActive;
            }
            else if (value == "scene-set-transform") {
                request.operation = BridgeOperation::SetSceneObjectTransform;
            }
            else if (value == "scene-component-create") {
                request.operation = BridgeOperation::CreateSceneComponent;
            }
            else if (value == "scene-component-delete") {
                request.operation = BridgeOperation::DeleteSceneComponent;
            }
            else {
                request.operation = BridgeOperation::InspectClass;
            }
        }
        else if (key == "--image") {
            request.image_name = value;
        }
        else if (key == "--namespace") {
            request.class_namespace = value;
        }
        else if (key == "--class") {
            request.class_name = value;
        }
        else if (key == "--instance") {
            request.instance_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--method-name") {
            request.method_name = value;
        }
        else if (key == "--method-signature") {
            request.method_signature = value;
        }
        else if (key == "--field-name") {
            request.field_name = value;
        }
        else if (key == "--field-type") {
            request.field_type_name = value;
        }
        else if (key == "--field-static") {
            request.field_is_static = value == "true";
        }
        else if (key == "--target-address") {
            request.target_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--object-address") {
            request.object_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--component-address") {
            request.component_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--name") {
            request.object_name = value;
        }
        else if (key == "--component-type") {
            request.component_type_name = value;
        }
        else if (key == "--active-self") {
            request.active_self = value == "true";
        }
        else if (key == "--offset") {
            request.offset = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--limit") {
            request.limit = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--position-x") {
            if (!request.local_position.has_value()) {
                request.local_position = Vector3Snapshot{};
            }
            request.local_position->x = ParseFloatValue(value);
        }
        else if (key == "--position-y") {
            if (!request.local_position.has_value()) {
                request.local_position = Vector3Snapshot{};
            }
            request.local_position->y = ParseFloatValue(value);
        }
        else if (key == "--position-z") {
            if (!request.local_position.has_value()) {
                request.local_position = Vector3Snapshot{};
            }
            request.local_position->z = ParseFloatValue(value);
        }
        else if (key == "--rotation-x") {
            if (!request.local_rotation.has_value()) {
                request.local_rotation = QuaternionSnapshot{};
            }
            request.local_rotation->x = ParseFloatValue(value);
        }
        else if (key == "--rotation-y") {
            if (!request.local_rotation.has_value()) {
                request.local_rotation = QuaternionSnapshot{};
            }
            request.local_rotation->y = ParseFloatValue(value);
        }
        else if (key == "--rotation-z") {
            if (!request.local_rotation.has_value()) {
                request.local_rotation = QuaternionSnapshot{};
            }
            request.local_rotation->z = ParseFloatValue(value);
        }
        else if (key == "--rotation-w") {
            if (!request.local_rotation.has_value()) {
                request.local_rotation = QuaternionSnapshot{};
            }
            request.local_rotation->w = ParseFloatValue(value);
        }
        else if (key == "--scale-x") {
            if (!request.local_scale.has_value()) {
                request.local_scale = Vector3Snapshot{};
            }
            request.local_scale->x = ParseFloatValue(value);
        }
        else if (key == "--scale-y") {
            if (!request.local_scale.has_value()) {
                request.local_scale = Vector3Snapshot{};
            }
            request.local_scale->y = ParseFloatValue(value);
        }
        else if (key == "--scale-z") {
            if (!request.local_scale.has_value()) {
                request.local_scale = Vector3Snapshot{};
            }
            request.local_scale->z = ParseFloatValue(value);
        }
        else if (key == "--value-kind") {
            request.field_value_kind = ParseFieldValueKind(value);
        }
        else if (key == "--field-value") {
            request.field_value = value;
        }
        else if (key == "--arg-kind") {
            InvokeArgument argument;
            argument.kind = ParseInvokeValueKind(value);
            if (index + 3 < tokens.size() && tokens[index + 2] == "--arg-value") {
                argument.value = tokens[index + 3];
                index += 2;
            }
            request.arguments.push_back(std::move(argument));
        }
    }

    if (request.pid == 0) {
        throw std::runtime_error("Missing required arguments");
    }

    if ((request.operation == BridgeOperation::InspectClass
            || request.operation == BridgeOperation::InvokeMethod
            || request.operation == BridgeOperation::SetField)
        && (request.image_name.empty() || request.class_name.empty())) {
        throw std::runtime_error("Missing required arguments");
    }

    if (request.operation == BridgeOperation::InvokeMethod && (request.method_name.empty() || request.method_signature.empty())) {
        throw std::runtime_error("Missing method invocation arguments");
    }

    if (request.operation == BridgeOperation::SetField && (request.field_name.empty() || request.field_type_name.empty())) {
        throw std::runtime_error("Missing field write arguments");
    }

        if ((request.operation == BridgeOperation::LoadSceneChildren
            || request.operation == BridgeOperation::LoadSceneChildrenPage
            || request.operation == BridgeOperation::InspectSceneObject
            || request.operation == BridgeOperation::InspectSceneObjectHeader
            || request.operation == BridgeOperation::InspectSceneObjectChildrenPage
            || request.operation == BridgeOperation::InspectSceneObjectComponentsPage)
        && !request.object_address.has_value()) {
        throw std::runtime_error("Missing scene object address");
    }

        if ((request.operation == BridgeOperation::LoadSceneChildrenPage
            || request.operation == BridgeOperation::InspectSceneObjectChildrenPage
            || request.operation == BridgeOperation::InspectSceneObjectComponentsPage)
        && !request.limit.has_value()) {
        throw std::runtime_error("Missing paged inspector limit");
    }

    if ((request.operation == BridgeOperation::DuplicateSceneObject
            || request.operation == BridgeOperation::DeleteSceneObject
            || request.operation == BridgeOperation::SetSceneObjectActive
            || request.operation == BridgeOperation::SetSceneObjectTransform
            || request.operation == BridgeOperation::CreateSceneComponent)
        && !request.object_address.has_value()) {
        throw std::runtime_error("Missing scene object address");
    }

    if (request.operation == BridgeOperation::DeleteSceneComponent && !request.component_address.has_value()) {
        throw std::runtime_error("Missing scene component address");
    }

    if (request.operation == BridgeOperation::CreateSceneChild
        && (!request.object_address.has_value() || !request.object_name.has_value())) {
        throw std::runtime_error("Missing scene child creation arguments");
    }

    if (request.operation == BridgeOperation::SetSceneObjectActive
        && (!request.object_address.has_value() || !request.active_self.has_value())) {
        throw std::runtime_error("Missing scene active-state arguments");
    }

    if (request.operation == BridgeOperation::SetSceneObjectTransform
        && (!request.local_position.has_value() || !request.local_rotation.has_value() || !request.local_scale.has_value())) {
        throw std::runtime_error("Missing scene transform arguments");
    }

    if (request.operation == BridgeOperation::CreateSceneComponent
        && (!request.object_address.has_value() || !request.component_type_name.has_value())) {
        throw std::runtime_error("Missing scene component creation arguments");
    }

    return request;
}

} // namespace

BridgeRequest ArgumentParser::Parse(int argc, char* argv[])
{
    std::vector<std::string> args;
    args.reserve(static_cast<std::size_t>(argc > 1 ? argc - 1 : 0));
    for (int index = 1; index < argc; ++index) {
        args.emplace_back(argv[index]);
    }

    return Parse(args);
}

BridgeRequest ArgumentParser::Parse(const std::vector<std::string>& args)
{
    return ParseTokens(args);
}

runtime::RuntimeInspector& RuntimeBridge::ResolveInspector(std::size_t pid)
{
    if (!inspector_ || !active_pid_.has_value() || *active_pid_ != pid) {
        inspector_ = std::make_unique<runtime::RuntimeInspector>(pid);
        active_pid_ = pid;
    }

    return *inspector_;
}

RuntimeClassOverlayResponse RuntimeBridge::Execute(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).InspectClass(request);
}

RuntimeMethodInvokeResponse RuntimeBridge::ExecuteInvoke(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).InvokeClassMethod(request);
}

RuntimeFieldSetResponse RuntimeBridge::ExecuteSetField(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).SetFieldValue(request);
}

SceneCatalogResponse RuntimeBridge::ExecuteSceneCatalog(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).LoadSceneCatalog(request);
    std::size_t root_count = 0;
    for (const auto& scene : response.scenes) {
        root_count += scene.roots.size();
    }
    LogScenePerf("scene_catalog", started_at, "scene_count=" + std::to_string(response.scenes.size()) + " root_count=" + std::to_string(root_count));
    return response;
}

SceneChildrenResponse RuntimeBridge::ExecuteSceneChildren(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).LoadSceneChildren(request);
    LogScenePerf("scene_children", started_at, "parent_object=" + response.parent_object_address + " child_count=" + std::to_string(response.children.size()));
    return response;
}

SceneChildrenPageResponse RuntimeBridge::ExecuteSceneChildrenPage(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).LoadSceneChildrenPage(request);
    LogScenePerf(
        "scene_children_page",
        started_at,
        "parent_object=" + response.parent_object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.children.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneObjectInspectorHeaderResponse RuntimeBridge::ExecuteSceneInspectHeader(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).InspectSceneObjectHeader(request);
    LogScenePerf(
        "scene_inspect_header",
        started_at,
        "object=" + response.object.object_address + " scene=" + response.scene_name.value_or(std::string("null")));
    return response;
}

SceneChildrenPageResponse RuntimeBridge::ExecuteSceneInspectChildrenPage(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).InspectSceneObjectChildrenPage(request);
    LogScenePerf(
        "scene_inspect_children_page",
        started_at,
        "parent_object=" + response.parent_object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.children.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneComponentsPageResponse RuntimeBridge::ExecuteSceneInspectComponentsPage(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).InspectSceneObjectComponentsPage(request);
    LogScenePerf(
        "scene_inspect_components_page",
        started_at,
        "object=" + response.object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.components.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneObjectInspectorResponse RuntimeBridge::ExecuteSceneInspect(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).InspectSceneObject(request);
    LogScenePerf(
        "scene_inspect",
        started_at,
        "object=" + response.object.object_address + " children=" + std::to_string(response.children.size()) + " components=" + std::to_string(response.components.size()));
    return response;
}

SceneMutationResponse RuntimeBridge::ExecuteSceneMutation(const BridgeRequest& request)
{
    const auto started_at = PerfClock::now();
    auto response = ResolveInspector(request.pid).MutateSceneObject(request);
    const auto object_address = response.target_object_address.value_or(std::string("null"));
    const auto parent_address = response.parent_object_address.value_or(std::string("null"));
    LogScenePerf(
        "scene_mutation",
        started_at,
        "object=" + object_address + " parent=" + parent_address);
    return response;
}

} // namespace bridge
