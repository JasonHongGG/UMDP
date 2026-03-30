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

        if (const auto get_is_static = TryFindMethod(game_object_class, "get_isStatic", 0); get_is_static.has_value()) {
            node.is_static = InvokeBool(game_object_class, *get_is_static, game_object_address);
        }

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