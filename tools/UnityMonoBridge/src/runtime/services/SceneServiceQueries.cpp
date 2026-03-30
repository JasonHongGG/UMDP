#include "runtime/services/SceneService.h"

#include <algorithm>
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

} // namespace

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

} // namespace bridge::runtime