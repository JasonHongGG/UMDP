#include "runtime/services/SceneService.h"

#include <Windows.h>

#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>

#include "shared/Formatting.h"
#include "win32/RemoteMemory.h"

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

std::string CurrentTimestamp()
{
    const auto now = std::chrono::system_clock::now().time_since_epoch();
    return std::to_string(std::chrono::duration_cast<std::chrono::seconds>(now).count());
}

std::string JoinInvokeContext(const MethodRecord& method, const std::string& detail)
{
    return method.name + " [" + method.signature + "]: " + detail;
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

std::string TrimAssemblyName(std::string value)
{
    value = Trim(std::move(value));
    if (value.size() > 4 && value.substr(value.size() - 4) == ".dll") {
        value.resize(value.size() - 4);
    }
    return value;
}

std::string SceneNameFromPath(const std::string& path)
{
    const auto file_name_start = path.find_last_of("\\/");
    const std::string file_name = file_name_start == std::string::npos ? path : path.substr(file_name_start + 1);
    const auto extension = file_name.find_last_of('.');
    return extension == std::string::npos ? file_name : file_name.substr(0, extension);
}

SceneKind InferSceneKind(const std::optional<int>& build_index, const std::optional<std::string>& path, const std::optional<std::string>& name)
{
    if (name.has_value() && *name == "DontDestroyOnLoad") {
        return SceneKind::DontDestroyOnLoad;
    }

    if (!build_index.has_value() || *build_index < 0) {
        if (!path.has_value() || path->empty()) {
            return SceneKind::HideAndDontSave;
        }
    }

    return SceneKind::Loaded;
}

bool AssemblyNameMatches(const std::string& image_name, const std::optional<std::string>& assembly_hint)
{
    if (!assembly_hint.has_value()) {
        return true;
    }

    return TrimAssemblyName(image_name) == TrimAssemblyName(*assembly_hint);
}

std::pair<std::string, std::optional<std::string>> SplitAssemblyQualifiedType(const std::string& value)
{
    const auto comma = value.find(',');
    if (comma == std::string::npos) {
        return { Trim(value), std::nullopt };
    }

    return {
        Trim(value.substr(0, comma)),
        TrimAssemblyName(value.substr(comma + 1)),
    };
}

std::vector<std::pair<std::string, std::string>> BuildTypeNameCandidates(const std::string& type_name)
{
    std::vector<std::pair<std::string, std::string>> candidates;
    const auto last_dot = type_name.rfind('.');
    if (last_dot != std::string::npos) {
        candidates.push_back({ type_name.substr(0, last_dot), type_name.substr(last_dot + 1) });
        return candidates;
    }

    candidates.push_back({ "UnityEngine", type_name });
    candidates.push_back({ std::string(), type_name });
    return candidates;
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
        const win32::Memory& memory,
    const AssemblyService& assembly_service,
    const ClassService& class_service,
    const FieldEnumerationService& field_enumeration_service,
    const FieldValueReader& field_value_reader,
    const MethodInvocationService& method_invocation_service)
    : api_(api),
            memory_(memory),
      assembly_service_(assembly_service),
      class_service_(class_service),
      field_enumeration_service_(field_enumeration_service),
      field_value_reader_(field_value_reader),
      method_invocation_service_(method_invocation_service)
{
}

SceneCatalogResponse SceneService::LoadSceneCatalog() const
{
    const auto started_at = PerfClock::now();
    const Address scene_manager_class = ResolveUnityClass("UnityEngine.SceneManagement", "SceneManager");
    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const auto scene_utility_class = [this]() -> std::optional<Address> {
        try {
            return ResolveUnityClass("UnityEngine.SceneManagement", "SceneUtility");
        }
        catch (const std::exception&) {
            return std::nullopt;
        }
    }();
    const MethodRecord get_scene_count = RequireMethod(scene_manager_class, "get_sceneCount", 0);
    const MethodRecord get_scene_at = RequireMethod(scene_manager_class, "GetSceneAt", 1);
    const MethodRecord get_root_game_objects = RequireMethod(scene_class, "GetRootGameObjects", 0);
    const auto is_valid = TryFindMethod(scene_class, "IsValid", 0);
    const auto get_is_loaded = TryFindMethod(scene_class, "get_isLoaded", 0);
    const auto get_build_index = TryFindMethod(scene_class, "get_buildIndex", 0);
    const auto get_path = TryFindMethod(scene_class, "get_path", 0);
    const auto get_scene_count_in_build_settings = scene_utility_class.has_value()
        ? TryFindMethod(*scene_utility_class, "get_sceneCountInBuildSettings", 0)
        : std::nullopt;
    const auto get_scene_path_by_build_index = scene_utility_class.has_value()
        ? TryFindMethod(*scene_utility_class, "GetScenePathByBuildIndex", 1)
        : std::nullopt;

    SceneCatalogResponse response;
    response.generated_at = CurrentTimestamp();

    const auto scene_count_started_at = PerfClock::now();
    const int scene_count = InvokeInt(scene_manager_class, get_scene_count, std::nullopt);
    LogScenePerf("catalog_scene_count", scene_count_started_at, "scene_count=" + std::to_string(scene_count));
    response.scenes.reserve(static_cast<std::size_t>(scene_count));
    std::size_t total_root_count = 0;
    for (int index = 0; index < scene_count; ++index) {
        const Address scene_boxed = InvokeObject(scene_manager_class, get_scene_at, std::nullopt, { NumberArgument(index) });
        if (scene_boxed == 0) {
            continue;
        }

        const Address raw_scene = RequireUnboxed(scene_boxed, "SceneManager.GetSceneAt result");
        if (is_valid.has_value() && !InvokeBool(scene_class, *is_valid, raw_scene)) {
            continue;
        }
        if (get_is_loaded.has_value() && !InvokeBool(scene_class, *get_is_loaded, raw_scene)) {
            continue;
        }

        const auto [scene_handle, scene_name] = ReadSceneIdentity(scene_boxed);
        if (!scene_handle.has_value()) {
            continue;
        }

        Address root_array = 0;
        const auto roots_started_at = PerfClock::now();
        try {
            root_array = InvokeObject(scene_class, get_root_game_objects, raw_scene);
        }
        catch (const std::exception& error) {
            const std::string message = error.what();
            if (message.find("scene is invalid") != std::string::npos) {
                continue;
            }

            throw std::runtime_error(
                "scene refresh failed at scene index "
                + std::to_string(index)
                + " handle "
                + std::to_string(*scene_handle)
                + ": "
                + message);
        }

        SceneDescriptorResponse scene;
        scene.scene_handle = *scene_handle;
        scene.name = scene_name.value_or(std::string("Scene ") + std::to_string(*scene_handle));
        scene.is_loaded = true;
        if (get_build_index.has_value()) {
            scene.build_index = InvokeInt(scene_class, *get_build_index, raw_scene);
        }
        if (get_path.has_value()) {
            const auto path = TryInvokeString(scene_class, *get_path, raw_scene);
            if (path.has_value() && !path->empty()) {
                scene.path = path;
            }
        }
        scene.kind = InferSceneKind(scene.build_index, scene.path, scene_name);

        const auto root_count = api_.GetArrayLength(root_array);
        LogScenePerf(
            "catalog_root_array",
            roots_started_at,
            "scene_index=" + std::to_string(index) + " scene_handle=" + std::to_string(*scene_handle) + " root_count=" + std::to_string(root_count));

        scene.roots.reserve(root_count);
        const auto root_summaries_started_at = PerfClock::now();
        for (std::size_t root_index = 0; root_index < root_count; ++root_index) {
            const Address root_object = api_.GetArrayElementAddress(root_array, root_index);
            if (root_object != 0) {
                scene.roots.push_back(BuildNodeSummary(root_object, NodeSummaryFlavor::Catalog));
            }
        }
        total_root_count += scene.roots.size();
        LogScenePerf(
            "catalog_root_summaries",
            root_summaries_started_at,
            "scene_index=" + std::to_string(index) + " scene_handle=" + std::to_string(*scene_handle) + " root_count=" + std::to_string(scene.roots.size()));

        response.scenes.push_back(std::move(scene));
    }

    if (scene_utility_class.has_value() && get_scene_count_in_build_settings.has_value() && get_scene_path_by_build_index.has_value()) {
        const int build_settings_count = InvokeInt(*scene_utility_class, *get_scene_count_in_build_settings, std::nullopt);
        response.build_settings_scenes.reserve(static_cast<std::size_t>(build_settings_count));
        for (int build_index = 0; build_index < build_settings_count; ++build_index) {
            const auto path = TryInvokeString(
                *scene_utility_class,
                *get_scene_path_by_build_index,
                std::nullopt,
                { NumberArgument(build_index) });
            if (!path.has_value() || path->empty()) {
                continue;
            }

            SceneBuildSettingsEntry entry;
            entry.build_index = build_index;
            entry.path = *path;
            entry.name = SceneNameFromPath(*path);
            entry.is_loaded = std::any_of(
                response.scenes.begin(),
                response.scenes.end(),
                [&](const SceneDescriptorResponse& scene) {
                    return scene.build_index.has_value() && *scene.build_index == build_index;
                });
            response.build_settings_scenes.push_back(std::move(entry));
        }
    }

    LogScenePerf(
        "load_scene_catalog",
        started_at,
        "scene_count=" + std::to_string(response.scenes.size())
            + " root_count=" + std::to_string(total_root_count)
            + " build_settings_count=" + std::to_string(response.build_settings_scenes.size()));

    return response;
}

SceneChildrenResponse SceneService::LoadSceneChildren(Address object_address) const
{
    const auto started_at = PerfClock::now();
    SceneChildrenResponse response;
    response.parent_object_address = FormatAddress(object_address);
    response.children = LoadChildrenForObject(object_address, NodeSummaryFlavor::Catalog);
    LogScenePerf(
        "load_scene_children",
        started_at,
        "parent_object=" + response.parent_object_address + " child_count=" + std::to_string(response.children.size()));
    return response;
}

SceneChildrenPageResponse SceneService::LoadSceneChildrenPage(Address object_address, std::size_t offset, std::size_t limit) const
{
    const auto started_at = PerfClock::now();
    SceneChildrenPageResponse response;
    response.generated_at = CurrentTimestamp();
    response.parent_object_address = FormatAddress(object_address);
    response.offset = offset;
    response.children = LoadChildrenForObject(
        object_address,
        NodeSummaryFlavor::Catalog,
        offset,
        limit,
        &response.total_count,
        &response.next_offset);
    LogScenePerf(
        "load_scene_children_page",
        started_at,
        "parent_object=" + response.parent_object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.children.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneObjectInspectorHeaderResponse SceneService::InspectSceneObjectHeader(Address object_address) const
{
    const auto started_at = PerfClock::now();
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord get_scene = RequireMethod(game_object_class, "get_scene", 0);
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);

    SceneObjectInspectorHeaderResponse response;
    response.generated_at = CurrentTimestamp();
    response.object = BuildNodeSummary(object_address, NodeSummaryFlavor::Inspector);

    const Address scene_object = InvokeObject(game_object_class, get_scene, object_address);
    const auto [scene_handle, scene_name] = ReadSceneIdentity(scene_object);
    response.scene_handle = scene_handle;
    response.scene_name = scene_name;
    if (scene_handle.has_value()) {
        const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
        const Address raw_scene = RequireUnboxed(scene_object, "UnityEngine.SceneManagement.Scene");
        const auto get_build_index = TryFindMethod(scene_class, "get_buildIndex", 0);
        const auto get_path = TryFindMethod(scene_class, "get_path", 0);
        const auto build_index = get_build_index.has_value() ? std::optional<int>(InvokeInt(scene_class, *get_build_index, raw_scene)) : std::nullopt;
        const auto path = get_path.has_value() ? TryInvokeString(scene_class, *get_path, raw_scene) : std::nullopt;
        response.scene_kind = InferSceneKind(build_index, path, scene_name);
    }

    const Address transform_address = InvokeObject(game_object_class, get_transform, object_address);
    response.transform = BuildTransformSnapshot(transform_address);
    response.hierarchy_path = BuildHierarchyPath(object_address);

    if (response.transform.has_value() && response.transform->parent_object_address.has_value()) {
        const Address parent_object = static_cast<Address>(std::stoull(*response.transform->parent_object_address, nullptr, 0));
        if (parent_object != 0) {
            std::optional<Address> parent_transform;
            if (response.transform->parent_transform_address.has_value()) {
                parent_transform = static_cast<Address>(std::stoull(*response.transform->parent_transform_address, nullptr, 0));
            }
            response.parent = BuildNodeSummary(parent_object, NodeSummaryFlavor::Inspector, parent_transform);
        }
    }

    LogScenePerf(
        "inspect_scene_object_header",
        started_at,
        "object=" + response.object.object_address + " scene=" + response.scene_name.value_or(std::string("null")));

    return response;
}

SceneChildrenPageResponse SceneService::LoadSceneInspectorChildrenPage(Address object_address, std::size_t offset, std::size_t limit) const
{
    const auto started_at = PerfClock::now();
    SceneChildrenPageResponse response;
    response.generated_at = CurrentTimestamp();
    response.parent_object_address = FormatAddress(object_address);
    response.offset = offset;
    response.children = LoadChildrenForObject(
        object_address,
        NodeSummaryFlavor::InspectorChild,
        offset,
        limit,
        &response.total_count,
        &response.next_offset);
    LogScenePerf(
        "load_scene_inspector_children_page",
        started_at,
        "parent_object=" + response.parent_object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.children.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneComponentsPageResponse SceneService::LoadSceneInspectorComponentsPage(Address object_address, std::size_t offset, std::size_t limit) const
{
    const auto started_at = PerfClock::now();
    SceneComponentsPageResponse response;
    response.generated_at = CurrentTimestamp();
    response.object_address = FormatAddress(object_address);
    response.offset = offset;
    response.components = LoadComponentsForObject(
        object_address,
        offset,
        limit,
        &response.total_count,
        &response.next_offset);
    LogScenePerf(
        "load_scene_inspector_components_page",
        started_at,
        "object=" + response.object_address
            + " offset=" + std::to_string(response.offset)
            + " loaded=" + std::to_string(response.components.size())
            + " total=" + std::to_string(response.total_count));
    return response;
}

SceneObjectInspectorResponse SceneService::InspectSceneObject(Address object_address) const
{
    const auto started_at = PerfClock::now();
    const auto header = InspectSceneObjectHeader(object_address);
    SceneObjectInspectorResponse response;
    response.generated_at = header.generated_at;
    response.scene_handle = header.scene_handle;
    response.scene_name = header.scene_name;
    response.scene_kind = header.scene_kind;
    response.object = header.object;
    response.parent = header.parent;
    response.hierarchy_path = header.hierarchy_path;
    response.transform = header.transform;
    response.children = LoadChildrenForObject(object_address, NodeSummaryFlavor::InspectorChild);
    response.components = LoadComponentsForObject(object_address);

    LogScenePerf(
        "inspect_scene_object",
        started_at,
        "object=" + response.object.object_address + " children=" + std::to_string(response.children.size()) + " components=" + std::to_string(response.components.size()));

    return response;
}

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

Address SceneService::ResolveUnityClass(const std::string& class_namespace, const std::string& class_name) const
{
    const std::string cache_key = class_namespace + "." + class_name;
    if (const auto found = class_cache_.find(cache_key); found != class_cache_.end()) {
        return found->second;
    }

    for (const auto& image_name : UnityImageCandidates()) {
        try {
            const Address image = assembly_service_.ResolveImage(image_name);
            const Address resolved = class_service_.ResolveClass(image, class_namespace, class_name);
            class_cache_.emplace(cache_key, resolved);
            return resolved;
        }
        catch (const std::exception&) {
        }
    }

    throw std::runtime_error("unity class not found: " + class_namespace + "." + class_name);
}

std::string SceneService::ResolveCachedTypeName(Address class_handle) const
{
    if (const auto found = type_name_cache_.find(class_handle); found != type_name_cache_.end()) {
        return found->second;
    }

    const auto type_name = api_.GetClassTypeName(class_handle);
    type_name_cache_.emplace(class_handle, type_name);
    return type_name;
}

std::optional<MethodRecord> SceneService::TryFindMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const
{
    const std::string cache_key = std::to_string(class_handle) + "::" + method_name + "/" + std::to_string(parameter_count);
    if (const auto found = method_cache_.find(cache_key); found != method_cache_.end()) {
        return found->second;
    }

    for (Address current_class = class_handle; current_class != 0; current_class = api_.GetParentClass(current_class)) {
        const auto methods = api_.EnumerateMethods(current_class);
        const auto found = std::find_if(methods.begin(), methods.end(), [&](const MethodRecord& method) {
            return method.name == method_name && method.parameters.size() == parameter_count;
        });
        if (found != methods.end()) {
            method_cache_[cache_key] = *found;
            return *found;
        }
    }

    method_cache_[cache_key] = std::nullopt;
    return std::nullopt;
}

MethodRecord SceneService::RequireMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const
{
    const auto method = TryFindMethod(class_handle, method_name, parameter_count);
    if (!method.has_value()) {
        throw std::runtime_error(
            "scene method not found on "
            + api_.GetClassTypeName(class_handle)
            + " (searched parent hierarchy): "
            + method_name
            + "/"
            + std::to_string(parameter_count));
    }

    return *method;
}

std::optional<MethodRecord> SceneService::TryFindMethodByParameterTypes(
    Address class_handle,
    const std::string& method_name,
    const std::vector<std::string>& parameter_types) const
{
    std::vector<std::string> normalized_types;
    normalized_types.reserve(parameter_types.size());
    for (const auto& type_name : parameter_types) {
        normalized_types.push_back(NormalizeSceneTypeName(type_name));
    }

    for (Address current_class = class_handle; current_class != 0; current_class = api_.GetParentClass(current_class)) {
        const auto methods = api_.EnumerateMethods(current_class);
        const auto found = std::find_if(methods.begin(), methods.end(), [&](const MethodRecord& method) {
            if (method.name != method_name || method.parameters.size() != normalized_types.size()) {
                return false;
            }

            for (std::size_t index = 0; index < normalized_types.size(); ++index) {
                if (NormalizeSceneTypeName(method.parameters[index].type_name) != normalized_types[index]) {
                    return false;
                }
            }

            return true;
        });

        if (found != methods.end()) {
            return *found;
        }
    }

    return std::nullopt;
}

MethodRecord SceneService::RequireMethodByParameterTypes(
    Address class_handle,
    const std::string& method_name,
    const std::vector<std::string>& parameter_types) const
{
    const auto method = TryFindMethodByParameterTypes(class_handle, method_name, parameter_types);
    if (!method.has_value()) {
        throw std::runtime_error(
            "scene method not found on "
            + api_.GetClassTypeName(class_handle)
            + ": "
            + method_name);
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

std::string SceneService::DescribeInvokeFailure(const RuntimeMethodInvokeResponse& response, const MethodRecord& method, const char* fallback) const
{
    if (response.exception.has_value() && !response.exception->empty()) {
        return JoinInvokeContext(method, *response.exception);
    }
    if (response.error.has_value() && !response.error->empty()) {
        return JoinInvokeContext(method, *response.error);
    }
    return JoinInvokeContext(method, fallback);
}

int SceneService::InvokeInt(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value() || !response.result->value.has_value()) {
        throw std::runtime_error(DescribeInvokeFailure(response, method, "scene integer invoke failed"));
    }

    return std::stoi(*response.result->value, nullptr, 0);
}

void SceneService::InvokeVoid(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success) {
        throw std::runtime_error(DescribeInvokeFailure(response, method, "scene void invoke failed"));
    }
}

bool SceneService::InvokeBool(
    Address class_handle,
    const MethodRecord& method,
    std::optional<Address> instance_address,
    std::vector<InvokeArgument> arguments) const
{
    const auto response = InvokeMethod(class_handle, method, instance_address, std::move(arguments));
    if (!response.success || !response.result.has_value() || !response.result->value.has_value()) {
        throw std::runtime_error(DescribeInvokeFailure(response, method, "scene bool invoke failed"));
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
        throw std::runtime_error(DescribeInvokeFailure(response, method, "scene string invoke failed"));
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
        throw std::runtime_error(DescribeInvokeFailure(response, method, "scene object invoke failed"));
    }

    if (response.result->object_address.has_value()) {
        return static_cast<Address>(std::stoull(*response.result->object_address, nullptr, 0));
    }

    return 0;
}

void SceneService::InvokePreparedArguments(
    const MethodRecord& method,
    std::optional<Address> instance_address,
    const std::vector<Address>& argument_pointers,
    const char* fallback) const
{
    win32::RemoteAllocation parameter_array(memory_, (std::max<std::size_t>)(std::size_t(1), argument_pointers.size()) * sizeof(Address), PAGE_READWRITE);
    if (!argument_pointers.empty()) {
        memory_.Write(parameter_array.address(), argument_pointers.data(), argument_pointers.size() * sizeof(Address));
    }

    win32::RemoteAllocation exception_storage(memory_, sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory_.Write(exception_storage.address(), zero);

    api_.InvokeMethod(
        method.handle,
        method.is_static ? 0 : instance_address.value_or(0),
        argument_pointers.empty() ? 0 : parameter_array.address(),
        exception_storage.address());

    const Address exception_object = memory_.Read<Address>(exception_storage.address());
    if (exception_object != 0) {
        throw std::runtime_error(
            JoinInvokeContext(method, api_.DescribeException(exception_object).value_or(std::string(fallback))));
    }
}

void SceneService::InvokeValueTypeVoid(
    const MethodRecord& method,
    std::optional<Address> instance_address,
    const void* value_bytes,
    std::size_t value_size,
    const char* fallback) const
{
    win32::RemoteAllocation value_storage(memory_, value_size, PAGE_READWRITE);
    memory_.Write(value_storage.address(), value_bytes, value_size);

    const Address argument_pointer = value_storage.address();
    win32::RemoteAllocation parameter_array(memory_, sizeof(Address), PAGE_READWRITE);
    memory_.Write(parameter_array.address(), argument_pointer);

    win32::RemoteAllocation exception_storage(memory_, sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory_.Write(exception_storage.address(), zero);

    api_.InvokeMethod(
        method.handle,
        method.is_static ? 0 : instance_address.value_or(0),
        parameter_array.address(),
        exception_storage.address());

    const Address exception_object = memory_.Read<Address>(exception_storage.address());
    if (exception_object != 0) {
        throw std::runtime_error(
            JoinInvokeContext(method, api_.DescribeException(exception_object).value_or(std::string(fallback))));
    }
}

Address SceneService::RequireUnboxed(Address boxed_object_address, const std::string& context) const
{
    const Address raw_value = api_.UnboxObject(boxed_object_address);
    if (raw_value == 0) {
        throw std::runtime_error(context + ": failed to unbox value-type instance");
    }

    return raw_value;
}

Address SceneService::CreateManagedObject(Address class_handle, const std::string& context) const
{
    const Address object_address = api_.CreateManagedObject(class_handle);
    if (object_address == 0) {
        throw std::runtime_error(context + ": failed to allocate managed object");
    }

    return object_address;
}

Address SceneService::ResolveManagedClassAnyImage(const std::string& class_namespace, const std::string& class_name) const
{
    for (const auto assembly : api_.EnumerateAssemblies()) {
        const Address image = api_.GetAssemblyImage(assembly);
        try {
            const Address resolved = class_service_.ResolveClass(image, class_namespace, class_name);
            if (resolved != 0) {
                return resolved;
            }
        }
        catch (const std::exception&) {
        }
    }

    throw std::runtime_error("managed class not found: " + class_namespace + "." + class_name);
}

Address SceneService::ResolveComponentClass(
    const std::string& component_type_name,
    std::string* resolved_type_name,
    std::string* assembly_name) const
{
    const auto [raw_type_name, assembly_hint] = SplitAssemblyQualifiedType(component_type_name);
    if (raw_type_name.empty()) {
        throw std::runtime_error("component type name is required");
    }

    const auto candidates = BuildTypeNameCandidates(raw_type_name);
    for (const auto assembly : api_.EnumerateAssemblies()) {
        const Address image = api_.GetAssemblyImage(assembly);
        const auto image_name = api_.GetImageName(image);
        if (!AssemblyNameMatches(image_name, assembly_hint)) {
            continue;
        }

        for (const auto& [class_namespace, class_name] : candidates) {
            try {
                const Address resolved = class_service_.ResolveClass(image, class_namespace, class_name);
                if (resolved == 0) {
                    continue;
                }

                if (resolved_type_name != nullptr) {
                    *resolved_type_name = class_namespace.empty() ? class_name : class_namespace + "." + class_name;
                }
                if (assembly_name != nullptr) {
                    *assembly_name = TrimAssemblyName(image_name);
                }
                return resolved;
            }
            catch (const std::exception&) {
            }
        }
    }

    throw std::runtime_error("component type not found: " + component_type_name);
}

Address SceneService::ResolveManagedTypeObject(const std::string& type_name, const std::string& assembly_name) const
{
    const Address type_class = ResolveManagedClassAnyImage("System", "Type");
    const auto assembly_qualified_name = assembly_name.empty() ? type_name : type_name + ", " + assembly_name;

    if (const auto get_type = TryFindMethodByParameterTypes(type_class, "GetType", { "System.String", "System.Boolean" }); get_type.has_value()) {
        const Address type_object = InvokeObject(type_class, *get_type, std::nullopt, {
            StringArgument(assembly_qualified_name),
            BooleanArgument(true),
        });
        if (type_object != 0) {
            return type_object;
        }
    }

    const auto get_type = RequireMethodByParameterTypes(type_class, "GetType", { "System.String" });
    const Address type_object = InvokeObject(type_class, get_type, std::nullopt, { StringArgument(assembly_qualified_name) });
    if (type_object == 0) {
        throw std::runtime_error("failed to resolve managed type object: " + assembly_qualified_name);
    }

    return type_object;
}

std::optional<FieldRecord> SceneService::TryFindInstanceField(Address class_handle, const std::string& field_name, const std::string& field_type) const
{
    const std::string cache_key = std::to_string(class_handle) + "::" + field_name + "::" + field_type;
    if (const auto found = field_cache_.find(cache_key); found != field_cache_.end()) {
        return found->second;
    }

    std::vector<FieldRecord> static_fields;
    std::vector<FieldRecord> instance_fields;
    field_enumeration_service_.AppendClassFields(class_handle, static_fields, instance_fields);
    const auto found = std::find_if(instance_fields.begin(), instance_fields.end(), [&](const FieldRecord& field) {
        return field.name == field_name && field.type_name == field_type;
    });

    if (found == instance_fields.end()) {
        field_cache_[cache_key] = std::nullopt;
        return std::nullopt;
    }

    field_cache_[cache_key] = *found;
    return *found;
}

std::optional<int> SceneService::ReadIntField(Address class_handle, Address instance_address, const std::string& field_name) const
{
    const auto found = TryFindInstanceField(class_handle, field_name, "System.Int32");
    if (!found.has_value()) {
        return std::nullopt;
    }

    return ParseOptionalInt(field_value_reader_.ReadFieldValue(*found, instance_address));
}

std::optional<float> SceneService::ReadFloatField(Address class_handle, Address instance_address, const std::string& field_name) const
{
    const auto found = TryFindInstanceField(class_handle, field_name, "System.Single");
    if (!found.has_value()) {
        return std::nullopt;
    }

    return ParseOptionalFloat(field_value_reader_.ReadFieldValue(*found, instance_address));
}

std::optional<Address> SceneService::TryReadParentObjectAddress(Address game_object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const MethodRecord get_transform = RequireMethod(game_object_class, "get_transform", 0);
    const MethodRecord get_parent = RequireMethod(transform_class, "get_parent", 0);
    const MethodRecord get_game_object = RequireMethod(transform_class, "get_gameObject", 0);

    const Address transform_address = InvokeObject(game_object_class, get_transform, game_object_address);
    if (transform_address == 0) {
        return std::nullopt;
    }

    const Address parent_transform = InvokeObject(transform_class, get_parent, transform_address);
    if (parent_transform == 0) {
        return std::nullopt;
    }

    const Address parent_object = InvokeObject(transform_class, get_game_object, parent_transform);
    return parent_object == 0 ? std::nullopt : std::optional<Address>(parent_object);
}

std::optional<Address> SceneService::TryReadOwningObjectAddressForComponent(Address component_address) const
{
    const Address component_class = ResolveUnityClass("UnityEngine", "Component");
    const MethodRecord get_game_object = RequireMethod(component_class, "get_gameObject", 0);
    const Address game_object = InvokeObject(component_class, get_game_object, component_address);
    return game_object == 0 ? std::nullopt : std::optional<Address>(game_object);
}

std::optional<int> SceneService::ReadSceneHandleForObject(Address game_object_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const MethodRecord get_scene = RequireMethod(game_object_class, "get_scene", 0);
    const Address scene_object = InvokeObject(game_object_class, get_scene, game_object_address);
    return ReadSceneIdentity(scene_object).first;
}

std::optional<Address> SceneService::TryResolveLoadedSceneBoxedAddress(int scene_handle) const
{
    const Address scene_manager_class = ResolveUnityClass("UnityEngine.SceneManagement", "SceneManager");
    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const MethodRecord get_scene_count = RequireMethod(scene_manager_class, "get_sceneCount", 0);
    const MethodRecord get_scene_at = RequireMethod(scene_manager_class, "GetSceneAt", 1);
    const auto is_valid = TryFindMethod(scene_class, "IsValid", 0);

    const int scene_count = InvokeInt(scene_manager_class, get_scene_count, std::nullopt);
    for (int index = 0; index < scene_count; ++index) {
        const Address scene_boxed = InvokeObject(scene_manager_class, get_scene_at, std::nullopt, { NumberArgument(index) });
        if (scene_boxed == 0) {
            continue;
        }

        const Address raw_scene = RequireUnboxed(scene_boxed, "UnityEngine.SceneManagement.Scene");
        if (is_valid.has_value() && !InvokeBool(scene_class, *is_valid, raw_scene)) {
            continue;
        }

        const auto current_handle = ReadSceneIdentity(scene_boxed).first;
        if (current_handle.has_value() && *current_handle == scene_handle) {
            return scene_boxed;
        }
    }

    return std::nullopt;
}

std::optional<Vector3Snapshot> SceneService::ReadVector3(Address boxed_value_address) const
{
    if (boxed_value_address == 0) {
        return std::nullopt;
    }

    const Address vector3_class = ResolveUnityClass("UnityEngine", "Vector3");
    const Address raw_value = RequireUnboxed(boxed_value_address, "UnityEngine.Vector3");
    const auto x = ReadFloatField(vector3_class, raw_value, "x");
    const auto y = ReadFloatField(vector3_class, raw_value, "y");
    const auto z = ReadFloatField(vector3_class, raw_value, "z");
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
    const Address raw_value = RequireUnboxed(boxed_value_address, "UnityEngine.Quaternion");
    const auto x = ReadFloatField(quaternion_class, raw_value, "x");
    const auto y = ReadFloatField(quaternion_class, raw_value, "y");
    const auto z = ReadFloatField(quaternion_class, raw_value, "z");
    const auto w = ReadFloatField(quaternion_class, raw_value, "w");
    if (!x.has_value() || !y.has_value() || !z.has_value() || !w.has_value()) {
        return std::nullopt;
    }

    return QuaternionSnapshot { *x, *y, *z, *w };
}

std::optional<std::string> SceneService::ReadEnumString(Address boxed_value_address) const
{
    if (boxed_value_address == 0) {
        return std::nullopt;
    }

    const Address enum_class = ResolveManagedClassAnyImage("System", "Enum");
    const MethodRecord to_string = RequireMethod(enum_class, "ToString", 0);
    return TryInvokeString(enum_class, to_string, boxed_value_address);
}

std::optional<std::string> SceneService::TryReadHideFlags(Address object_address) const
{
    const Address object_class = ResolveUnityClass("UnityEngine", "Object");
    const auto get_hide_flags = TryFindMethod(object_class, "get_hideFlags", 0);
    if (!get_hide_flags.has_value()) {
        return std::nullopt;
    }

    return ReadEnumString(InvokeObject(object_class, *get_hide_flags, object_address));
}

SceneNodeSummary SceneService::BuildNodeSummary(
    Address game_object_address,
    NodeSummaryFlavor flavor,
    std::optional<Address> known_transform_address) const
{
    const Address game_object_class = ResolveUnityClass("UnityEngine", "GameObject");
    const Address transform_class = ResolveUnityClass("UnityEngine", "Transform");
    const auto get_name = TryFindMethod(game_object_class, "get_name", 0);
    const auto get_transform = TryFindMethod(game_object_class, "get_transform", 0);
    const MethodRecord get_game_object = RequireMethod(transform_class, "get_gameObject", 0);
    const auto get_parent = TryFindMethod(transform_class, "get_parent", 0);

    SceneNodeSummary node;
    node.object_address = FormatAddress(game_object_address);
    if (get_name.has_value()) {
        node.name = TryInvokeString(game_object_class, *get_name, game_object_address).value_or("<unnamed>");
    }
    else {
        node.name = "<unnamed>";
    }

    Address transform_address = known_transform_address.value_or(0);
    if (transform_address == 0 && get_transform.has_value()) {
        transform_address = InvokeObject(game_object_class, *get_transform, game_object_address);
    }
    node.transform_address = transform_address == 0 ? std::nullopt : std::optional<std::string>(FormatAddress(transform_address));

    if (transform_address != 0) {
        const MethodRecord get_child_count = RequireMethod(transform_class, "get_childCount", 0);
        node.child_count = static_cast<std::size_t>(InvokeInt(transform_class, get_child_count, transform_address));
        node.has_children = node.child_count > 0;
        if (get_parent.has_value()) {
            const Address parent_transform = InvokeObject(transform_class, *get_parent, transform_address);
            if (parent_transform != 0) {
                const Address parent_object = InvokeObject(transform_class, get_game_object, parent_transform);
                if (parent_object != 0) {
                    node.parent_object_address = FormatAddress(parent_object);
                }
            }
        }
    }

    if (flavor != NodeSummaryFlavor::Catalog) {
        const MethodRecord get_active_self = RequireMethod(game_object_class, "get_activeSelf", 0);
        const MethodRecord get_layer = RequireMethod(game_object_class, "get_layer", 0);
        node.active_self = InvokeBool(game_object_class, get_active_self, game_object_address);
        node.layer = InvokeInt(game_object_class, get_layer, game_object_address);

        if (const auto get_tag = TryFindMethod(game_object_class, "get_tag", 0); get_tag.has_value()) {
            node.tag = TryInvokeString(game_object_class, *get_tag, game_object_address);
        }

        if (const auto get_component_count = TryFindMethod(game_object_class, "GetComponentCount", 0); get_component_count.has_value()) {
            node.component_count = static_cast<std::size_t>(InvokeInt(game_object_class, *get_component_count, game_object_address));
        }

        node.hide_flags = TryReadHideFlags(game_object_address);
        const auto hierarchy_path = BuildHierarchyPath(game_object_address);
        if (!hierarchy_path.empty()) {
            std::string canonical_path;
            for (std::size_t index = 0; index < hierarchy_path.size(); ++index) {
                if (index > 0) {
                    canonical_path += "/";
                }
                canonical_path += hierarchy_path[index].name;
            }
            node.path = canonical_path;
        }
    }

    return node;
}

std::vector<SceneNodeSummary> SceneService::LoadChildrenForObject(
    Address game_object_address,
    NodeSummaryFlavor flavor,
    std::size_t offset,
    std::optional<std::size_t> limit,
    std::size_t* total_count,
    std::optional<std::size_t>* next_offset) const
{
    const auto started_at = PerfClock::now();
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

    const std::size_t child_count = static_cast<std::size_t>(InvokeInt(transform_class, get_child_count, transform_address));
    if (total_count != nullptr) {
        *total_count = child_count;
    }

    const std::size_t start_index = (std::min)(offset, child_count);
    const std::size_t end_index = limit.has_value() ? (std::min)(child_count, start_index + *limit) : child_count;
    if (next_offset != nullptr) {
        *next_offset = end_index < child_count ? std::optional<std::size_t>(end_index) : std::nullopt;
    }

    std::vector<SceneNodeSummary> children;
    children.reserve(end_index - start_index);
    const auto summaries_started_at = PerfClock::now();
    for (std::size_t index = start_index; index < end_index; ++index) {
        const Address child_transform = InvokeObject(transform_class, get_child, transform_address, { NumberArgument(static_cast<int>(index)) });
        if (child_transform == 0) {
            continue;
        }
        const Address child_object = InvokeObject(transform_class, get_game_object, child_transform);
        if (child_object != 0) {
            children.push_back(BuildNodeSummary(child_object, flavor, child_transform));
        }
    }

    LogScenePerf(
        "build_child_summaries",
        summaries_started_at,
        "parent_object=" + FormatAddress(game_object_address)
            + " child_count=" + std::to_string(children.size())
            + " offset=" + std::to_string(start_index)
            + " total=" + std::to_string(child_count));
    LogScenePerf(
        "load_children_for_object",
        started_at,
        "parent_object=" + FormatAddress(game_object_address)
            + " child_count=" + std::to_string(children.size())
            + " offset=" + std::to_string(start_index)
            + " total=" + std::to_string(child_count));

    return children;
}

std::vector<SceneComponentSummary> SceneService::LoadComponentsForObject(
    Address game_object_address,
    std::size_t offset,
    std::optional<std::size_t> limit,
    std::size_t* total_count,
    std::optional<std::size_t>* next_offset) const
{
    const auto started_at = PerfClock::now();
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

    const std::size_t component_count = static_cast<std::size_t>(InvokeInt(game_object_class, *get_component_count, game_object_address));
    if (total_count != nullptr) {
        *total_count = component_count;
    }

    const std::size_t start_index = (std::min)(offset, component_count);
    const std::size_t end_index = limit.has_value() ? (std::min)(component_count, start_index + *limit) : component_count;
    if (next_offset != nullptr) {
        *next_offset = end_index < component_count ? std::optional<std::size_t>(end_index) : std::nullopt;
    }

    std::vector<SceneComponentSummary> components;
    components.reserve(end_index - start_index);
    for (std::size_t index = start_index; index < end_index; ++index) {
        const Address component_address = InvokeObject(game_object_class, *query_component, game_object_address, { NumberArgument(static_cast<int>(index)) });
        if (component_address == 0) {
            continue;
        }

        SceneComponentSummary component;
        component.component_address = FormatAddress(component_address);
        component.type_name = ResolveCachedTypeName(api_.GetObjectClass(component_address));
        const Address behaviour_class = ResolveUnityClass("UnityEngine", "Behaviour");
        for (Address current = api_.GetObjectClass(component_address); current != 0; current = api_.GetParentClass(current)) {
            if (current == behaviour_class) {
                component.is_behaviour = true;
                break;
            }
        }
        if (component.is_behaviour) {
            const MethodRecord get_enabled = RequireMethod(behaviour_class, "get_enabled", 0);
            component.behaviour_enabled = InvokeBool(behaviour_class, get_enabled, component_address);
        }
        components.push_back(std::move(component));
    }

    LogScenePerf(
        "load_components_for_object",
        started_at,
        "object=" + FormatAddress(game_object_address)
            + " component_count=" + std::to_string(components.size())
            + " offset=" + std::to_string(start_index)
            + " total=" + std::to_string(component_count));

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
    const auto get_position = TryFindMethod(transform_class, "get_position", 0);
    const MethodRecord get_local_position = RequireMethod(transform_class, "get_localPosition", 0);
    const MethodRecord get_local_rotation = RequireMethod(transform_class, "get_localRotation", 0);
    const auto get_local_euler_angles = TryFindMethod(transform_class, "get_localEulerAngles", 0);
    const auto get_local_euler_angles_raw = TryFindMethod(transform_class, "get_localEulerAnglesRaw", 0);
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

    if (get_position.has_value()) {
        snapshot.world_position = ReadVector3(InvokeObject(transform_class, *get_position, transform_address));
    }
    snapshot.local_position = ReadVector3(InvokeObject(transform_class, get_local_position, transform_address));
    snapshot.local_rotation = ReadQuaternion(InvokeObject(transform_class, get_local_rotation, transform_address));
    if (get_local_euler_angles_raw.has_value()) {
        snapshot.local_euler_angles = ReadVector3(InvokeObject(transform_class, *get_local_euler_angles_raw, transform_address));
    }
    else if (get_local_euler_angles.has_value()) {
        snapshot.local_euler_angles = ReadVector3(InvokeObject(transform_class, *get_local_euler_angles, transform_address));
    }
    snapshot.local_scale = ReadVector3(InvokeObject(transform_class, get_local_scale, transform_address));
    return snapshot;
}

std::pair<std::optional<int>, std::optional<std::string>> SceneService::ReadSceneIdentity(Address scene_boxed_address) const
{
    if (scene_boxed_address == 0) {
        return { std::nullopt, std::nullopt };
    }

    const Address scene_class = ResolveUnityClass("UnityEngine.SceneManagement", "Scene");
    const Address raw_scene = RequireUnboxed(scene_boxed_address, "UnityEngine.SceneManagement.Scene");

    std::optional<std::string> scene_name;
    if (const auto get_name = TryFindMethod(scene_class, "get_name", 0); get_name.has_value()) {
        scene_name = TryInvokeString(scene_class, *get_name, raw_scene);
    }

    return {
        ReadIntField(scene_class, raw_scene, "m_Handle"),
        scene_name,
    };
}

std::vector<SceneHierarchyPathEntry> SceneService::BuildHierarchyPath(Address game_object_address) const
{
    std::vector<SceneHierarchyPathEntry> path;
    Address current = game_object_address;
    while (current != 0) {
        SceneHierarchyPathEntry entry;
        entry.object_address = FormatAddress(current);
        entry.name = BuildNodeSummary(current, NodeSummaryFlavor::Catalog).name;
        path.push_back(std::move(entry));

        const auto parent = TryReadParentObjectAddress(current);
        if (!parent.has_value()) {
            break;
        }
        current = *parent;
    }

    std::reverse(path.begin(), path.end());
    return path;
}

} // namespace bridge::runtime