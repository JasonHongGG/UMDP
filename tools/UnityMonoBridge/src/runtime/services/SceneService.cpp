#include "runtime/services/SceneService.h"

#include <algorithm>
#include <chrono>
#include <stdexcept>

#include "shared/Formatting.h"

namespace bridge::runtime {

namespace {

std::string FormatAddress(Address value)
{
    return std::string("0x") + shared::HexAddress(value);
}

std::string CurrentTimestamp()
{
    const auto now = std::chrono::system_clock::now().time_since_epoch();
    return std::to_string(std::chrono::duration_cast<std::chrono::seconds>(now).count());
}

InvokeArgument NumberArgument(int value)
{
    InvokeArgument argument;
    argument.kind = InvokeValueKind::Number;
    argument.value = std::to_string(value);
    return argument;
}

std::optional<int> ParseOptionalInt(const std::optional<std::string>& value)
{
    if (!value.has_value()) {
        return std::nullopt;
    }

    return std::stoi(*value, nullptr, 0);
}

std::optional<float> ParseOptionalFloat(const std::optional<std::string>& value)
{
    if (!value.has_value()) {
        return std::nullopt;
    }

    return std::stof(*value);
}

const std::vector<std::string>& UnityImageCandidates()
{
    static const std::vector<std::string> candidates {
        "UnityEngine.CoreModule",
        "UnityEngine",
    };
    return candidates;
}

} // namespace

SceneService::SceneService(
    const RuntimeApi& api,
    const AssemblyService& assembly_service,
    const ClassService& class_service,
    const FieldEnumerationService& field_enumeration_service,
    const FieldValueReader& field_value_reader,
    const MethodInvocationService& method_invocation_service)
    : api_(api),
      assembly_service_(assembly_service),
      class_service_(class_service),
      field_enumeration_service_(field_enumeration_service),
      field_value_reader_(field_value_reader),
      method_invocation_service_(method_invocation_service)
{
}

SceneCatalogResponse SceneService::LoadSceneCatalog() const
{
    const Address scene_manager_class = ResolveUnityClass("UnityEngine.SceneManagement", "SceneManager");
    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const MethodRecord get_scene_count = RequireMethod(scene_manager_class, "get_sceneCount", 0);
    const MethodRecord get_scene_at = RequireMethod(scene_manager_class, "GetSceneAt", 1);
    const MethodRecord get_root_game_objects = RequireMethod(scene_class, "GetRootGameObjects", 0);

    SceneCatalogResponse response;
    response.generated_at = CurrentTimestamp();

    const int scene_count = InvokeInt(scene_manager_class, get_scene_count, std::nullopt);
    response.scenes.reserve(static_cast<std::size_t>(scene_count));
    for (int index = 0; index < scene_count; ++index) {
        const Address scene_object = InvokeObject(scene_manager_class, get_scene_at, std::nullopt, { NumberArgument(index) });
        if (scene_object == 0) {
            continue;
        }

        const auto [scene_handle, scene_name] = ReadSceneIdentity(scene_object);
        if (!scene_handle.has_value()) {
            continue;
        }

        const Address root_array = InvokeObject(scene_class, get_root_game_objects, scene_object);

        SceneDescriptorResponse scene;
        scene.scene_handle = *scene_handle;
        scene.name = scene_name.value_or(std::string("Scene ") + std::to_string(*scene_handle));
        scene.is_loaded = true;

        const auto root_count = api_.GetArrayLength(root_array);
        scene.roots.reserve(root_count);
        for (std::size_t root_index = 0; root_index < root_count; ++root_index) {
            const Address root_object = api_.GetArrayElementAddress(root_array, root_index);
            if (root_object != 0) {
                scene.roots.push_back(BuildNodeSummary(root_object));
            }
        }

        response.scenes.push_back(std::move(scene));
    }

    return response;
}

SceneChildrenResponse SceneService::LoadSceneChildren(Address object_address) const
{
    SceneChildrenResponse response;
    response.parent_object_address = FormatAddress(object_address);
    response.children = LoadChildrenForObject(object_address);
    return response;
}

SceneObjectInspectorResponse SceneService::InspectSceneObject(Address object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord get_scene = RequireMethod(game_object_class, "get_scene", 0);
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);

    SceneObjectInspectorResponse response;
    response.generated_at = CurrentTimestamp();
    response.object = BuildNodeSummary(object_address);

    const Address scene_object = InvokeObject(game_object_class, get_scene, object_address);
    const auto [scene_handle, scene_name] = ReadSceneIdentity(scene_object);
    response.scene_handle = scene_handle;
    response.scene_name = scene_name;

    const Address transform_address = InvokeObject(game_object_class, get_transform, object_address);
    response.transform = BuildTransformSnapshot(transform_address);
    response.children = LoadChildrenForObject(object_address);
    response.components = LoadComponentsForObject(object_address);

    if (response.transform.has_value() && response.transform->parent_object_address.has_value()) {
        const Address parent_object = static_cast<Address>(std::stoull(*response.transform->parent_object_address, nullptr, 0));
        if (parent_object != 0) {
            response.parent = BuildNodeSummary(parent_object);
        }
    }

    return response;
}

Address SceneService::ResolveUnityClass(const std::string& class_namespace, const std::string& class_name) const
{
    for (const auto& image_name : UnityImageCandidates()) {
        try {
            const Address image = assembly_service_.ResolveImage(image_name);
            return class_service_.ResolveClass(image, class_namespace, class_name);
        }
        catch (const std::exception&) {
        }
    }

    throw std::runtime_error("unity class not found: " + class_namespace + "." + class_name);
}

std::optional<MethodRecord> SceneService::TryFindMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const
{
    const auto methods = api_.EnumerateMethods(class_handle);
    const auto found = std::find_if(methods.begin(), methods.end(), [&](const MethodRecord& method) {
        return method.name == method_name && method.parameters.size() == parameter_count;
    });
    if (found == methods.end()) {
        return std::nullopt;
    }

    return *found;
}

MethodRecord SceneService::RequireMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const
{
    const auto method = TryFindMethod(class_handle, method_name, parameter_count);
    if (!method.has_value()) {
        throw std::runtime_error("scene method not found: " + method_name);
    }

    return *method;
}

RuntimeMethodInvokeResponse SceneService::InvokeMethod(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    BridgeRequest request;
    request.method_name = method.name;
    request.method_signature = method.signature;
    request.instance_address = instance_address;
    request.arguments = std::move(arguments);
    return method_invocation_service_.InvokeClassMethod(class_handle, request);
}

int SceneService::InvokeInt(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value() || !response.result->value.has_value()) {
        throw std::runtime_error(response.error.value_or("scene integer invoke failed"));
    }

    return std::stoi(*response.result->value, nullptr, 0);
}

bool SceneService::InvokeBool(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value() || !response.result->value.has_value()) {
        throw std::runtime_error(response.error.value_or("scene bool invoke failed"));
    }

    return *response.result->value == "true";
}

std::optional<std::string> SceneService::TryInvokeString(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value()) {
        return std::nullopt;
    }

    return response.result->value;
}

Address SceneService::InvokeObject(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value()) {
        throw std::runtime_error(response.error.value_or("scene object invoke failed"));
    }

    if (response.result->object_address.has_value()) {
        return static_cast<Address>(std::stoull(*response.result->object_address, nullptr, 0));
    }

    return 0;
}

std::optional<int> SceneService::ReadIntField(Address class_handle, Address instance_address, const std::string& field_name) const
{
    std::vector<FieldRecord> static_fields;
    std::vector<FieldRecord> instance_fields;
    field_enumeration_service_.AppendClassFields(class_handle, static_fields, instance_fields);
    const auto found = std::find_if(instance_fields.begin(), instance_fields.end(), [&](const FieldRecord& field) {
        return field.name == field_name && field.type_name == "System.Int32";
    });
    if (found == instance_fields.end()) {
        return std::nullopt;
    }

    return ParseOptionalInt(field_value_reader_.ReadFieldValue(*found, instance_address));
}

std::optional<float> SceneService::ReadFloatField(Address class_handle, Address instance_address, const std::string& field_name) const
{
    std::vector<FieldRecord> static_fields;
    std::vector<FieldRecord> instance_fields;
    field_enumeration_service_.AppendClassFields(class_handle, static_fields, instance_fields);
    const auto found = std::find_if(instance_fields.begin(), instance_fields.end(), [&](const FieldRecord& field) {
        return field.name == field_name && field.type_name == "System.Single";
    });
    if (found == instance_fields.end()) {
        return std::nullopt;
    }

    return ParseOptionalFloat(field_value_reader_.ReadFieldValue(*found, instance_address));
}

std::optional<Vector3Snapshot> SceneService::ReadVector3(Address boxed_value_address) const
{
    if (boxed_value_address == 0) {
        return std::nullopt;
    }

    const Address vector3_class = ResolveUnityClass("UnityEngine", "Vector3");
    const auto x = ReadFloatField(vector3_class, boxed_value_address, "x");
    const auto y = ReadFloatField(vector3_class, boxed_value_address, "y");
    const auto z = ReadFloatField(vector3_class, boxed_value_address, "z");
    if (!x.has_value() || !y.has_value() || !z.has_value()) {
        return std::nullopt;
    }

    return Vector3Snapshot { *x, *y, *z };
}

std::optional<QuaternionSnapshot> SceneService::ReadQuaternion(Address boxed_value_address) const
{
    if (boxed_value_address == 0) {
        return std::nullopt;
    }

    const Address quaternion_class = ResolveUnityClass("UnityEngine", "Quaternion");
    const auto x = ReadFloatField(quaternion_class, boxed_value_address, "x");
    const auto y = ReadFloatField(quaternion_class, boxed_value_address, "y");
    const auto z = ReadFloatField(quaternion_class, boxed_value_address, "z");
    const auto w = ReadFloatField(quaternion_class, boxed_value_address, "w");
    if (!x.has_value() || !y.has_value() || !z.has_value() || !w.has_value()) {
        return std::nullopt;
    }

    return QuaternionSnapshot { *x, *y, *z, *w };
}

SceneNodeSummary SceneService::BuildNodeSummary(Address game_object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");

    const MethodRecord get_name = RequireMethod(game_object_class, "get_name", 0);
    const MethodRecord get_active_self = RequireMethod(game_object_class, "get_activeSelf", 0);
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);
    const MethodRecord get_layer = RequireMethod(game_object_class, "get_layer", 0);
    const MethodRecord get_child_count = RequireMethod(transform_class, "get_childCount", 0);

    const Address transform_address = InvokeObject(game_object_class, get_transform, game_object_address);

    SceneNodeSummary node;
    node.object_address = FormatAddress(game_object_address);
    node.transform_address = transform_address == 0 ? std::nullopt : std::optional<std::string>(FormatAddress(transform_address));
    node.name = TryInvokeString(game_object_class, get_name, game_object_address).value_or("<unnamed>");
    node.active_self = InvokeBool(game_object_class, get_active_self, game_object_address);
    node.layer = InvokeInt(game_object_class, get_layer, game_object_address);

    if (const auto get_tag = TryFindMethod(game_object_class, "get_tag", 0); get_tag.has_value()) {
        node.tag = TryInvokeString(game_object_class, *get_tag, game_object_address);
    }

    if (transform_address != 0) {
        node.child_count = static_cast<std::size_t>(InvokeInt(transform_class, get_child_count, transform_address));
        node.has_children = node.child_count > 0;
    }

    if (const auto get_component_count = TryFindMethod(game_object_class, "GetComponentCount", 0); get_component_count.has_value()) {
        node.component_count = static_cast<std::size_t>(InvokeInt(game_object_class, *get_component_count, game_object_address));
    }

    return node;
}

std::vector<SceneNodeSummary> SceneService::LoadChildrenForObject(Address game_object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);
    const MethodRecord get_child_count = RequireMethod(transform_class, "get_childCount", 0);
    const MethodRecord get_child = RequireMethod(transform_class, "GetChild", 1);
    const MethodRecord get_game_object = RequireMethod(transform_class, "get_gameObject", 0);

    const Address transform_address = InvokeObject(game_object_class, get_transform, game_object_address);
    if (transform_address == 0) {
        return {};
    }

    const int child_count = InvokeInt(transform_class, get_child_count, transform_address);
    std::vector<SceneNodeSummary> children;
    children.reserve(static_cast<std::size_t>(child_count));
    for (int index = 0; index < child_count; ++index) {
        const Address child_transform = InvokeObject(transform_class, get_child, transform_address, { NumberArgument(index) });
        if (child_transform == 0) {
            continue;
        }
        const Address child_object = InvokeObject(transform_class, get_game_object, child_transform);
        if (child_object != 0) {
            children.push_back(BuildNodeSummary(child_object));
        }
    }

    return children;
}

std::vector<SceneComponentSummary> SceneService::LoadComponentsForObject(Address game_object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const auto get_component_count = TryFindMethod(game_object_class, "GetComponentCount", 0);
    if (!get_component_count.has_value()) {
        return {};
    }

    auto query_component = TryFindMethod(game_object_class, "QueryComponentAtIndex", 1);
    if (!query_component.has_value()) {
        query_component = TryFindMethod(game_object_class, "GetComponentAtIndex", 1);
    }
    if (!query_component.has_value()) {
        return {};
    }

    const int component_count = InvokeInt(game_object_class, *get_component_count, game_object_address);
    std::vector<SceneComponentSummary> components;
    components.reserve(static_cast<std::size_t>(component_count));
    for (int index = 0; index < component_count; ++index) {
        const Address component_address = InvokeObject(game_object_class, *query_component, game_object_address, { NumberArgument(index) });
        if (component_address == 0) {
            continue;
        }

        SceneComponentSummary component;
        component.component_address = FormatAddress(component_address);
        component.type_name = api_.GetClassTypeName(api_.GetObjectClass(component_address));
        components.push_back(std::move(component));
    }

    return components;
}

std::optional<SceneTransformSnapshotResponse> SceneService::BuildTransformSnapshot(Address transform_address) const
{
    if (transform_address == 0) {
        return std::nullopt;
    }

    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_parent = RequireMethod(transform_class, "get_parent", 0);
    const MethodRecord get_child_count = RequireMethod(transform_class, "get_childCount", 0);
    const MethodRecord get_game_object = RequireMethod(transform_class, "get_gameObject", 0);
    const MethodRecord get_local_position = RequireMethod(transform_class, "get_localPosition", 0);
    const MethodRecord get_local_rotation = RequireMethod(transform_class, "get_localRotation", 0);
    const MethodRecord get_local_scale = RequireMethod(transform_class, "get_localScale", 0);

    SceneTransformSnapshotResponse snapshot;
    snapshot.transform_address = FormatAddress(transform_address);
    snapshot.child_count = static_cast<std::size_t>(InvokeInt(transform_class, get_child_count, transform_address));

    const Address parent_transform = InvokeObject(transform_class, get_parent, transform_address);
    if (parent_transform != 0) {
        snapshot.parent_transform_address = FormatAddress(parent_transform);
        const Address parent_object = InvokeObject(transform_class, get_game_object, parent_transform);
        if (parent_object != 0) {
            snapshot.parent_object_address = FormatAddress(parent_object);
        }
    }

    snapshot.local_position = ReadVector3(InvokeObject(transform_class, get_local_position, transform_address));
    snapshot.local_rotation = ReadQuaternion(InvokeObject(transform_class, get_local_rotation, transform_address));
    snapshot.local_scale = ReadVector3(InvokeObject(transform_class, get_local_scale, transform_address));
    return snapshot;
}

std::pair<std::optional<int>, std::optional<std::string>> SceneService::ReadSceneIdentity(Address scene_boxed_address) const
{
    if (scene_boxed_address == 0) {
        return { std::nullopt, std::nullopt };
    }

    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const MethodRecord get_name = RequireMethod(scene_class, "get_name", 0);
    return {
        ReadIntField(scene_class, scene_boxed_address, "m_Handle"),
        TryInvokeString(scene_class, get_name, scene_boxed_address),
    };
}

} // namespace bridge::runtime