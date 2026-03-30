#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "bridge/BridgeModels.h"
#include "runtime/api/RuntimeApi.h"
#include "runtime/services/AssemblyService.h"
#include "runtime/services/ClassService.h"
#include "runtime/services/FieldEnumerationService.h"
#include "runtime/services/FieldValueReader.h"
#include "runtime/services/MethodInvocationService.h"
#include "win32/Memory.h"

namespace bridge::runtime {

class SceneService {
public:
    SceneService(
        const RuntimeApi& api,
        const win32::Memory& memory,
        const AssemblyService& assembly_service,
        const ClassService& class_service,
        const FieldEnumerationService& field_enumeration_service,
        const FieldValueReader& field_value_reader,
        const MethodInvocationService& method_invocation_service);

    SceneCatalogResponse LoadSceneCatalog() const;
    SceneChildrenResponse LoadSceneChildren(Address object_address) const;
    SceneChildrenPageResponse LoadSceneChildrenPage(Address object_address, std::size_t offset, std::size_t limit) const;
    SceneObjectInspectorHeaderResponse InspectSceneObjectHeader(Address object_address) const;
    SceneChildrenPageResponse LoadSceneInspectorChildrenPage(Address object_address, std::size_t offset, std::size_t limit) const;
    SceneComponentsPageResponse LoadSceneInspectorComponentsPage(Address object_address, std::size_t offset, std::size_t limit) const;
    SceneObjectInspectorResponse InspectSceneObject(Address object_address) const;
    SceneMutationResponse CreateSceneRoot(int scene_handle, const std::string& name) const;
    SceneMutationResponse CreateSceneChild(Address parent_object_address, const std::string& name) const;
    SceneMutationResponse DuplicateSceneObject(Address object_address) const;
    SceneMutationResponse DeleteSceneObject(Address object_address) const;
    SceneMutationResponse RenameSceneObject(Address object_address, const std::string& name) const;
    SceneMutationResponse SetSceneObjectTag(Address object_address, const std::string& tag) const;
    SceneMutationResponse SetSceneObjectLayer(Address object_address, int layer) const;
    SceneMutationResponse SetSceneObjectHideFlags(Address object_address, const std::string& hide_flags) const;
    SceneMutationResponse ReparentSceneObject(Address object_address, std::optional<Address> parent_object_address) const;
    SceneMutationResponse SetSceneObjectActive(Address object_address, bool active_self) const;
    SceneMutationResponse SetSceneObjectTransform(
        Address object_address,
        const std::optional<Vector3Snapshot>& world_position,
        const std::optional<Vector3Snapshot>& local_position,
        const std::optional<QuaternionSnapshot>& local_rotation,
        const std::optional<Vector3Snapshot>& local_euler_angles,
        const std::optional<Vector3Snapshot>& local_scale) const;
    SceneMutationResponse SetSceneBehaviourEnabled(Address component_address, bool enabled) const;
    SceneMutationResponse CreateSceneComponent(Address object_address, const std::string& component_type_name) const;
    SceneMutationResponse DeleteSceneComponent(Address component_address) const;
    SceneMutationResponse LoadSceneByBuildIndex(int build_index) const;

private:
    enum class NodeSummaryFlavor {
        Catalog,
        Inspector,
        InspectorChild,
    };

    Address ResolveUnityClass(const std::string& class_namespace, const std::string& class_name) const;
    std::string ResolveCachedTypeName(Address class_handle) const;
    std::optional<MethodRecord> TryFindMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const;
    MethodRecord RequireMethod(Address class_handle, const std::string& method_name, std::size_t parameter_count) const;
    std::optional<MethodRecord> TryFindMethodByParameterTypes(
        Address class_handle,
        const std::string& method_name,
        const std::vector<std::string>& parameter_types) const;
    MethodRecord RequireMethodByParameterTypes(
        Address class_handle,
        const std::string& method_name,
        const std::vector<std::string>& parameter_types) const;

    RuntimeMethodInvokeResponse InvokeMethod(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;

    int InvokeInt(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;

    void InvokeVoid(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;

    bool InvokeBool(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;

    std::optional<std::string> TryInvokeString(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;

    Address InvokeObject(
        Address class_handle,
        const MethodRecord& method,
        std::optional<Address> instance_address,
        std::vector<InvokeArgument> arguments = {}) const;
    void InvokePreparedArguments(
        const MethodRecord& method,
        std::optional<Address> instance_address,
        const std::vector<Address>& argument_pointers,
        const char* fallback) const;
    void InvokeValueTypeVoid(
        const MethodRecord& method,
        std::optional<Address> instance_address,
        const void* value_bytes,
        std::size_t value_size,
        const char* fallback) const;

    std::optional<FieldRecord> TryFindInstanceField(Address class_handle, const std::string& field_name, const std::string& field_type) const;
    std::optional<int> ReadIntField(Address class_handle, Address instance_address, const std::string& field_name) const;
    std::optional<float> ReadFloatField(Address class_handle, Address instance_address, const std::string& field_name) const;
    std::optional<Address> TryReadParentObjectAddress(Address game_object_address) const;
    std::optional<Address> TryReadOwningObjectAddressForComponent(Address component_address) const;
    std::optional<int> ReadSceneHandleForObject(Address game_object_address) const;
    std::optional<Address> TryResolveLoadedSceneBoxedAddress(int scene_handle) const;
    std::optional<Vector3Snapshot> ReadVector3(Address boxed_value_address) const;
    std::optional<QuaternionSnapshot> ReadQuaternion(Address boxed_value_address) const;
    std::optional<std::string> ReadEnumString(Address boxed_value_address) const;
    std::optional<std::string> TryReadHideFlags(Address object_address) const;
    Address RequireUnboxed(Address boxed_object_address, const std::string& context) const;
    Address CreateManagedObject(Address class_handle, const std::string& context) const;
    std::string DescribeInvokeFailure(const RuntimeMethodInvokeResponse& response, const MethodRecord& method, const char* fallback) const;
    Address ResolveManagedClassAnyImage(const std::string& class_namespace, const std::string& class_name) const;
    Address ResolveComponentClass(const std::string& component_type_name, std::string* resolved_type_name, std::string* assembly_name) const;
    Address ResolveManagedTypeObject(const std::string& type_name, const std::string& assembly_name) const;

    SceneNodeSummary BuildNodeSummary(
        Address game_object_address,
        NodeSummaryFlavor flavor,
        std::optional<Address> known_transform_address = std::nullopt) const;
    std::vector<SceneNodeSummary> LoadChildrenForObject(
        Address game_object_address,
        NodeSummaryFlavor flavor,
        std::size_t offset = 0,
        std::optional<std::size_t> limit = std::nullopt,
        std::size_t* total_count = nullptr,
        std::optional<std::size_t>* next_offset = nullptr) const;
    std::vector<SceneComponentSummary> LoadComponentsForObject(
        Address game_object_address,
        std::size_t offset = 0,
        std::optional<std::size_t> limit = std::nullopt,
        std::size_t* total_count = nullptr,
        std::optional<std::size_t>* next_offset = nullptr) const;
    std::optional<SceneTransformSnapshotResponse> BuildTransformSnapshot(Address transform_address) const;
    std::pair<std::optional<int>, std::optional<std::string>> ReadSceneIdentity(Address scene_boxed_address) const;
    std::vector<SceneHierarchyPathEntry> BuildHierarchyPath(Address game_object_address) const;

    const RuntimeApi& api_;
    const win32::Memory& memory_;
    const AssemblyService& assembly_service_;
    const ClassService& class_service_;
    const FieldEnumerationService& field_enumeration_service_;
    const FieldValueReader& field_value_reader_;
    const MethodInvocationService& method_invocation_service_;
    mutable std::unordered_map<std::string, Address> class_cache_;
    mutable std::unordered_map<std::string, std::optional<MethodRecord>> method_cache_;
    mutable std::unordered_map<std::string, std::optional<FieldRecord>> field_cache_;
    mutable std::unordered_map<Address, std::string> type_name_cache_;
};

} // namespace bridge::runtime