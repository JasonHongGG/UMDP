#include "runtime/services/SceneService.h"

#include <chrono>
#include <iostream>
#include <stdexcept>

#include "shared/Formatting.h"

namespace bridge::runtime {

namespace {

using PerfClock = std::chrono::steady_clock;

void LogScenePerf(const char* label, PerfClock::time_point started_at, const std::string& details)
{
    std::cerr << "[perf][SceneService] " << label << " completed in "
              << std::chrono::duration_cast<std::chrono::milliseconds>(PerfClock::now() - started_at).count()
              << "ms " << details << std::endl;
}

std::string FormatAddress(Address value)
{
    return std::string("0x") + shared::HexAddress(value);
}

InvokeArgument NumberArgument(int value)
{
    InvokeArgument argument;
    argument.kind = InvokeValueKind::Number;
    argument.value = std::to_string(value);
    return argument;
}

InvokeArgument BooleanArgument(bool value)
{
    InvokeArgument argument;
    argument.kind = InvokeValueKind::Boolean;
    argument.value = value ? std::optional<std::string>("true") : std::optional<std::string>("false");
    return argument;
}

InvokeArgument NullArgument()
{
    return {};
}

InvokeArgument StringArgument(const std::string& value)
{
    InvokeArgument argument;
    argument.kind = InvokeValueKind::String;
    argument.value = value;
    return argument;
}

InvokeArgument AddressArgument(Address value)
{
    InvokeArgument argument;
    argument.kind = InvokeValueKind::Address;
    argument.value = FormatAddress(value);
    return argument;
}

std::string Trim(std::string value)
{
    const auto start = value.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) {
        return std::string();
    }

    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(start, end - start + 1);
}

std::string NormalizeSceneTypeName(std::string value)
{
    value = Trim(std::move(value));
    if (value == "string") {
        return "System.String";
    }
    if (value == "bool") {
        return "System.Boolean";
    }
    return value;
}

} // namespace

SceneMutationResponse SceneService::CreateSceneChild(Address parent_object_address, const std::string& name) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);

    const Address child_object = CreateManagedObject(game_object_class, "UnityEngine.GameObject");
    if (const auto ctor_with_name = TryFindMethod(game_object_class, ".ctor", 1); ctor_with_name.has_value()) {
        InvokeVoid(game_object_class, *ctor_with_name, child_object, { StringArgument(name) });
    }
    else {
        const MethodRecord ctor_without_name = RequireMethod(game_object_class, ".ctor", 0);
        InvokeVoid(game_object_class, ctor_without_name, child_object);
        if (const auto set_name = TryFindMethod(game_object_class, "set_name", 1); set_name.has_value()) {
            InvokeVoid(game_object_class, *set_name, child_object, { StringArgument(name) });
        }
    }

    const Address parent_transform = InvokeObject(game_object_class, get_transform, parent_object_address);
    const Address child_transform = InvokeObject(game_object_class, get_transform, child_object);
    if (parent_transform != 0 && child_transform != 0) {
        if (const auto set_parent = TryFindMethod(transform_class, "SetParent", 1); set_parent.has_value()) {
            InvokeVoid(transform_class, *set_parent, child_transform, { AddressArgument(parent_transform) });
        }
        else {
            const MethodRecord set_parent_world = RequireMethod(transform_class, "SetParent", 2);
            InvokeVoid(transform_class, set_parent_world, child_transform, { AddressArgument(parent_transform), BooleanArgument(false) });
        }
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::CreateChild;
    response.scene_handle = ReadSceneHandleForObject(child_object);
    response.target_object_address = FormatAddress(child_object);
    response.parent_object_address = FormatAddress(parent_object_address);
    response.object = BuildNodeSummary(child_object, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;

    LogScenePerf(
        "create_scene_child",
        started_at,
        "parent_object=" + *response.parent_object_address + " child_object=" + *response.target_object_address);
    return response;
}

SceneMutationResponse SceneService::CreateSceneRoot(int scene_handle, const std::string& name) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address scene_manager_class = ResolveUnityClass("UnityEngine.SceneManagement", "SceneManager");

    const Address root_object = CreateManagedObject(game_object_class, "UnityEngine.GameObject");
    if (const auto ctor_with_name = TryFindMethod(game_object_class, ".ctor", 1); ctor_with_name.has_value()) {
        InvokeVoid(game_object_class, *ctor_with_name, root_object, { StringArgument(name) });
    }
    else {
        const MethodRecord ctor_without_name = RequireMethod(game_object_class, ".ctor", 0);
        InvokeVoid(game_object_class, ctor_without_name, root_object);
        if (const auto set_name = TryFindMethod(game_object_class, "set_name", 1); set_name.has_value()) {
            InvokeVoid(game_object_class, *set_name, root_object, { StringArgument(name) });
        }
    }

    if (scene_handle > 0) {
        const auto scene_boxed = TryResolveLoadedSceneBoxedAddress(scene_handle);
        const auto move_to_scene = TryFindMethod(scene_manager_class, "MoveGameObjectToScene", 2);
        if (scene_boxed.has_value() && move_to_scene.has_value()) {
            const Address raw_scene = RequireUnboxed(*scene_boxed, "UnityEngine.SceneManagement.Scene");
            InvokePreparedArguments(*move_to_scene, std::nullopt, { root_object, raw_scene }, "move root object to scene failed");
        }
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::CreateRoot;
    response.scene_handle = ReadSceneHandleForObject(root_object);
    response.target_object_address = FormatAddress(root_object);
    response.object = BuildNodeSummary(root_object, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.hierarchy_path = BuildHierarchyPath(root_object);
    SceneSelectionHint selection_hint;
    selection_hint.scene_handle = response.scene_handle;
    selection_hint.object_address = *response.target_object_address;
    response.preferred_selection_hint = std::move(selection_hint);

    LogScenePerf(
        "create_scene_root",
        started_at,
        "scene_handle=" + std::to_string(scene_handle) + " object=" + *response.target_object_address);
    return response;
}

SceneMutationResponse SceneService::DuplicateSceneObject(Address object_address) const
{
    const auto started_at = PerfClock::now();
    const Address object_class = ResolveUnityClass("UnityEngine", "Object");
    const MethodRecord instantiate = RequireMethod(object_class, "Instantiate", 1);
    const Address duplicated_object = InvokeObject(object_class, instantiate, std::nullopt, { AddressArgument(object_address) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::Duplicate;
    response.scene_handle = ReadSceneHandleForObject(duplicated_object);
    response.target_object_address = FormatAddress(duplicated_object);
    if (const auto parent_object = TryReadParentObjectAddress(duplicated_object); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(duplicated_object, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;

    LogScenePerf(
        "duplicate_scene_object",
        started_at,
        "source_object=" + FormatAddress(object_address) + " duplicated_object=" + *response.target_object_address);
    return response;
}

SceneMutationResponse SceneService::DeleteSceneObject(Address object_address) const
{
    const auto started_at = PerfClock::now();
    const Address object_class = ResolveUnityClass("UnityEngine", "Object");
    const std::optional<Address> parent_object = TryReadParentObjectAddress(object_address);
    const std::optional<int> scene_handle = ReadSceneHandleForObject(object_address);
    if (const auto destroy_immediate = TryFindMethod(object_class, "DestroyImmediate", 1); destroy_immediate.has_value()) {
        InvokeVoid(object_class, *destroy_immediate, std::nullopt, { AddressArgument(object_address) });
    }
    else {
        const MethodRecord destroy = RequireMethod(object_class, "Destroy", 1);
        InvokeVoid(object_class, destroy, std::nullopt, { AddressArgument(object_address) });
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::Delete;
    response.scene_handle = scene_handle;
    response.target_object_address = FormatAddress(object_address);
    response.deleted_object_address = response.target_object_address;
    if (parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
        response.preferred_selection_address = response.parent_object_address;
    }
    response.active_self = std::nullopt;

    LogScenePerf(
        "delete_scene_object",
        started_at,
        "object=" + *response.target_object_address + " parent=" + response.parent_object_address.value_or(std::string("null")));
    return response;
}

SceneMutationResponse SceneService::RenameSceneObject(Address object_address, const std::string& name) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord set_name = RequireMethod(game_object_class, "set_name", 1);
    InvokeVoid(game_object_class, set_name, object_address, { StringArgument(name) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::Rename;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.hierarchy_path = BuildHierarchyPath(object_address);

    LogScenePerf("rename_scene_object", started_at, "object=" + *response.target_object_address + " name=" + name);
    return response;
}

SceneMutationResponse SceneService::SetSceneObjectTag(Address object_address, const std::string& tag) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord set_tag = RequireMethod(game_object_class, "set_tag", 1);
    InvokeVoid(game_object_class, set_tag, object_address, { StringArgument(tag) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetTag;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.tag = response.object->tag;
    response.hierarchy_path = BuildHierarchyPath(object_address);

    LogScenePerf("set_scene_object_tag", started_at, "object=" + *response.target_object_address + " tag=" + tag);
    return response;
}

SceneMutationResponse SceneService::SetSceneObjectLayer(Address object_address, int layer) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord set_layer = RequireMethod(game_object_class, "set_layer", 1);
    InvokeVoid(game_object_class, set_layer, object_address, { NumberArgument(layer) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetLayer;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.layer = response.object->layer;
    response.hierarchy_path = BuildHierarchyPath(object_address);

    LogScenePerf("set_scene_object_layer", started_at, "object=" + *response.target_object_address + " layer=" + std::to_string(layer));
    return response;
}

SceneMutationResponse SceneService::SetSceneObjectHideFlags(Address object_address, const std::string& hide_flags) const
{
    const auto started_at = PerfClock::now();
    const Address object_class = ResolveUnityClass("UnityEngine", "Object");
    const Address enum_type = ResolveManagedTypeObject("UnityEngine.HideFlags", "UnityEngine.CoreModule");
    const Address enum_class = ResolveManagedClassAnyImage("System", "Enum");
    const MethodRecord parse_enum = RequireMethodByParameterTypes(enum_class, "Parse", { "System.Type", "System.String", "System.Boolean" });
    const Address boxed_enum = InvokeObject(enum_class, parse_enum, std::nullopt, {
        AddressArgument(enum_type),
        StringArgument(hide_flags),
        BooleanArgument(true),
    });
    if (boxed_enum == 0) {
        throw std::runtime_error("failed to parse UnityEngine.HideFlags value");
    }

    const MethodRecord set_hide_flags = RequireMethodByParameterTypes(object_class, "set_hideFlags", { "UnityEngine.HideFlags" });
    const Address raw_hide_flags = RequireUnboxed(boxed_enum, "UnityEngine.HideFlags");
    const std::int32_t hide_flags_value = memory_.Read<std::int32_t>(raw_hide_flags);
    InvokeValueTypeVoid(set_hide_flags, object_address, &hide_flags_value, sizeof(hide_flags_value), "scene hideFlags write failed");

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetHideFlags;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.hide_flags = response.object->hide_flags;
    response.hierarchy_path = BuildHierarchyPath(object_address);

    LogScenePerf("set_scene_object_hide_flags", started_at, "object=" + *response.target_object_address + " hide_flags=" + hide_flags);
    return response;
}

SceneMutationResponse SceneService::ReparentSceneObject(Address object_address, std::optional<Address> parent_object_address) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);

    const Address transform_address = InvokeObject(game_object_class, get_transform, object_address);
    if (transform_address == 0) {
        throw std::runtime_error("failed to resolve object transform");
    }

    std::optional<Address> parent_transform;
    if (parent_object_address.has_value()) {
        const Address resolved_parent_transform = InvokeObject(game_object_class, get_transform, *parent_object_address);
        if (resolved_parent_transform == 0) {
            throw std::runtime_error("failed to resolve target parent transform");
        }
        parent_transform = resolved_parent_transform;
    }

    if (const auto set_parent_with_world = TryFindMethod(transform_class, "SetParent", 2); set_parent_with_world.has_value()) {
        InvokeVoid(
            transform_class,
            *set_parent_with_world,
            transform_address,
            { parent_transform.has_value() ? AddressArgument(*parent_transform) : NullArgument(), BooleanArgument(false) });
    }
    else {
        const MethodRecord set_parent = RequireMethod(transform_class, "SetParent", 1);
        InvokeVoid(
            transform_class,
            set_parent,
            transform_address,
            { parent_transform.has_value() ? AddressArgument(*parent_transform) : NullArgument() });
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::Reparent;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (parent_object_address.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object_address);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.hierarchy_path = BuildHierarchyPath(object_address);
    SceneSelectionHint selection_hint;
    selection_hint.scene_handle = response.scene_handle;
    selection_hint.object_address = *response.target_object_address;
    for (const auto& entry : response.hierarchy_path) {
        if (entry.object_address != *response.target_object_address) {
            selection_hint.ancestor_object_addresses.push_back(entry.object_address);
        }
    }
    response.preferred_selection_hint = std::move(selection_hint);

    LogScenePerf(
        "reparent_scene_object",
        started_at,
        "object=" + *response.target_object_address + " parent=" + response.parent_object_address.value_or(std::string("null")));
    return response;
}

SceneMutationResponse SceneService::SetSceneObjectActive(Address object_address, bool active_self) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord set_active = RequireMethod(game_object_class, "SetActive", 1);
    InvokeVoid(game_object_class, set_active, object_address, { BooleanArgument(active_self) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetActive;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;

    LogScenePerf(
        "set_scene_object_active",
        started_at,
        "object=" + *response.target_object_address + " active=" + (active_self ? "true" : "false"));
    return response;
}

SceneMutationResponse SceneService::SetSceneObjectTransform(
    Address object_address,
    const std::optional<Vector3Snapshot>& world_position,
    const std::optional<Vector3Snapshot>& local_position,
    const std::optional<QuaternionSnapshot>& local_rotation,
    const std::optional<Vector3Snapshot>& local_euler_angles,
    const std::optional<Vector3Snapshot>& local_scale) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);

    const Address transform_address = InvokeObject(game_object_class, get_transform, object_address);
    if (transform_address == 0) {
        throw std::runtime_error("failed to resolve object transform");
    }

    if (world_position.has_value()) {
        const MethodRecord set_position = RequireMethodByParameterTypes(transform_class, "set_position", { "UnityEngine.Vector3" });
        InvokeValueTypeVoid(set_position, transform_address, &*world_position, sizeof(Vector3Snapshot), "scene transform world position write failed");
    }
    if (local_position.has_value()) {
        const MethodRecord set_local_position = RequireMethodByParameterTypes(transform_class, "set_localPosition", { "UnityEngine.Vector3" });
        InvokeValueTypeVoid(set_local_position, transform_address, &*local_position, sizeof(Vector3Snapshot), "scene transform local position write failed");
    }
    if (local_rotation.has_value()) {
        const MethodRecord set_local_rotation = RequireMethodByParameterTypes(transform_class, "set_localRotation", { "UnityEngine.Quaternion" });
        InvokeValueTypeVoid(set_local_rotation, transform_address, &*local_rotation, sizeof(QuaternionSnapshot), "scene transform rotation write failed");
    }
    if (local_euler_angles.has_value()) {
        MethodRecord set_local_euler = RequireMethodByParameterTypes(transform_class, "set_localEulerAngles", { "UnityEngine.Vector3" });
        if (const auto local_euler_raw = TryFindMethodByParameterTypes(transform_class, "set_localEulerAnglesRaw", { "UnityEngine.Vector3" }); local_euler_raw.has_value()) {
            set_local_euler = *local_euler_raw;
        }
        InvokeValueTypeVoid(set_local_euler, transform_address, &*local_euler_angles, sizeof(Vector3Snapshot), "scene transform euler write failed");
    }
    if (local_scale.has_value()) {
        const MethodRecord set_local_scale = RequireMethodByParameterTypes(transform_class, "set_localScale", { "UnityEngine.Vector3" });
        InvokeValueTypeVoid(set_local_scale, transform_address, &*local_scale, sizeof(Vector3Snapshot), "scene transform scale write failed");
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetTransform;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.transform = BuildTransformSnapshot(transform_address);

    LogScenePerf(
        "set_scene_object_transform",
        started_at,
        "object=" + *response.target_object_address);
    return response;
}

SceneMutationResponse SceneService::SetSceneBehaviourEnabled(Address component_address, bool enabled) const
{
    const auto started_at = PerfClock::now();
    const auto owner_object = TryReadOwningObjectAddressForComponent(component_address);
    if (!owner_object.has_value()) {
        throw std::runtime_error("failed to resolve component owner");
    }

    const Address behaviour_class = ResolveUnityClass("UnityEngine", "Behaviour");
    const MethodRecord set_enabled = RequireMethod(behaviour_class, "set_enabled", 1);
    InvokeVoid(behaviour_class, set_enabled, component_address, { BooleanArgument(enabled) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::SetBehaviourEnabled;
    response.scene_handle = ReadSceneHandleForObject(*owner_object);
    response.target_object_address = FormatAddress(*owner_object);
    if (const auto parent_object = TryReadParentObjectAddress(*owner_object); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(*owner_object, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;
    response.behaviour_enabled = enabled;
    response.hierarchy_path = BuildHierarchyPath(*owner_object);

    LogScenePerf(
        "set_scene_behaviour_enabled",
        started_at,
        "component=" + FormatAddress(component_address) + " enabled=" + std::string(enabled ? "true" : "false"));
    return response;
}

SceneMutationResponse SceneService::CreateSceneComponent(Address object_address, const std::string& component_type_name) const
{
    const auto started_at = PerfClock::now();
    std::string resolved_type_name;
    std::string assembly_name;
    ResolveComponentClass(component_type_name, &resolved_type_name, &assembly_name);

    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address type_object = ResolveManagedTypeObject(resolved_type_name, assembly_name);

    MethodRecord add_component;
    if (const auto direct_add = TryFindMethodByParameterTypes(game_object_class, "AddComponent", { "System.Type" }); direct_add.has_value()) {
        add_component = *direct_add;
    }
    else if (const auto internal_add = TryFindMethodByParameterTypes(game_object_class, "Internal_AddComponentWithType", { "System.Type" }); internal_add.has_value()) {
        add_component = *internal_add;
    }
    else {
        add_component = RequireMethodByParameterTypes(game_object_class, "AddComponent", { "System.String" });
    }

    if (NormalizeSceneTypeName(add_component.parameters.front().type_name) == "System.Type") {
        const Address component_address = InvokeObject(game_object_class, add_component, object_address, { AddressArgument(type_object) });
        if (component_address == 0) {
            throw std::runtime_error("AddComponent returned null");
        }
    }
    else {
        const Address component_address = InvokeObject(game_object_class, add_component, object_address, { StringArgument(resolved_type_name) });
        if (component_address == 0) {
            throw std::runtime_error("AddComponent returned null");
        }
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::AddComponent;
    response.scene_handle = ReadSceneHandleForObject(object_address);
    response.target_object_address = FormatAddress(object_address);
    if (const auto parent_object = TryReadParentObjectAddress(object_address); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;

    LogScenePerf(
        "create_scene_component",
        started_at,
        "object=" + *response.target_object_address + " type=" + resolved_type_name);
    return response;
}

SceneMutationResponse SceneService::DeleteSceneComponent(Address component_address) const
{
    const auto started_at = PerfClock::now();
    const Address object_class = ResolveUnityClass("UnityEngine", "Object");
    const auto owner_object = TryReadOwningObjectAddressForComponent(component_address);
    if (!owner_object.has_value()) {
        throw std::runtime_error("failed to resolve component owner");
    }

    const auto component_type_name = ResolveCachedTypeName(api_.GetObjectClass(component_address));
    if (component_type_name == "UnityEngine.Transform") {
        throw std::runtime_error("cannot delete Transform component");
    }

    if (const auto destroy_immediate = TryFindMethod(object_class, "DestroyImmediate", 1); destroy_immediate.has_value()) {
        InvokeVoid(object_class, *destroy_immediate, std::nullopt, { AddressArgument(component_address) });
    }
    else {
        const MethodRecord destroy = RequireMethod(object_class, "Destroy", 1);
        InvokeVoid(object_class, destroy, std::nullopt, { AddressArgument(component_address) });
    }

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::RemoveComponent;
    response.scene_handle = ReadSceneHandleForObject(*owner_object);
    response.target_object_address = FormatAddress(*owner_object);
    if (const auto parent_object = TryReadParentObjectAddress(*owner_object); parent_object.has_value()) {
        response.parent_object_address = FormatAddress(*parent_object);
    }
    response.object = BuildNodeSummary(*owner_object, NodeSummaryFlavor::Inspector);
    response.preferred_selection_address = response.target_object_address;
    response.active_self = response.object->active_self;

    LogScenePerf(
        "delete_scene_component",
        started_at,
        "component=" + FormatAddress(component_address) + " object=" + *response.target_object_address);
    return response;
}

SceneMutationResponse SceneService::LoadSceneByBuildIndex(int build_index) const
{
    const auto started_at = PerfClock::now();
    const Address scene_manager_class = ResolveUnityClass("UnityEngine.SceneManagement", "SceneManager");
    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const MethodRecord load_scene = RequireMethod(scene_manager_class, "LoadScene", 1);
    const MethodRecord get_scene_count = RequireMethod(scene_manager_class, "get_sceneCount", 0);
    const MethodRecord get_scene_at = RequireMethod(scene_manager_class, "GetSceneAt", 1);
    const auto get_build_index = TryFindMethod(scene_class, "get_buildIndex", 0);
    InvokeVoid(scene_manager_class, load_scene, std::nullopt, { NumberArgument(build_index) });

    SceneMutationResponse response;
    response.operation = SceneMutationOperation::LoadScene;
    response.preferred_selection_address = std::nullopt;
    response.active_self = std::nullopt;

    const int scene_count = InvokeInt(scene_manager_class, get_scene_count, std::nullopt);
    for (int index = 0; index < scene_count; ++index) {
        const Address scene_boxed = InvokeObject(scene_manager_class, get_scene_at, std::nullopt, { NumberArgument(index) });
        if (scene_boxed == 0) {
            continue;
        }

        if (get_build_index.has_value()) {
            const Address raw_scene = RequireUnboxed(scene_boxed, "UnityEngine.SceneManagement.Scene");
            if (InvokeInt(scene_class, *get_build_index, raw_scene) != build_index) {
                continue;
            }
        }

        const auto [scene_handle, scene_name] = ReadSceneIdentity(scene_boxed);
        response.scene_handle = scene_handle;
        LogScenePerf(
            "load_scene_by_build_index",
            started_at,
            "build_index=" + std::to_string(build_index) + " scene=" + scene_name.value_or(std::string("null")));
        return response;
    }

    LogScenePerf("load_scene_by_build_index", started_at, "build_index=" + std::to_string(build_index));

    return response;
}

} // namespace bridge::runtime