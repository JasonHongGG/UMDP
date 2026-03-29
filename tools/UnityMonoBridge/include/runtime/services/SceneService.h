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

namespace bridge::runtime {

class SceneService {
public:
    SceneService(
        const RuntimeApi& api,
        const AssemblyService& assembly_service,
        const ClassService& class_service,
        const FieldEnumerationService& field_enumeration_service,
        const FieldValueReader& field_value_reader,
        const MethodInvocationService& method_invocation_service);

    SceneCatalogResponse LoadSceneCatalog() const;
    SceneChildrenResponse LoadSceneChildren(Address object_address) const;
    SceneObjectInspectorHeaderResponse InspectSceneObjectHeader(Address object_address) const;
    SceneChildrenPageResponse LoadSceneInspectorChildrenPage(Address object_address, std::size_t offset, std::size_t limit) const;
    SceneComponentsPageResponse LoadSceneInspectorComponentsPage(Address object_address, std::size_t offset, std::size_t limit) const;
    SceneObjectInspectorResponse InspectSceneObject(Address object_address) const;
    SceneMutationResponse CreateSceneChild(Address parent_object_address, const std::string& name) const;
    SceneMutationResponse DuplicateSceneObject(Address object_address) const;
    SceneMutationResponse DeleteSceneObject(Address object_address) const;
    SceneMutationResponse SetSceneObjectActive(Address object_address, bool active_self) const;

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

    std::optional<FieldRecord> TryFindInstanceField(Address class_handle, const std::string& field_name, const std::string& field_type) const;
    std::optional<int> ReadIntField(Address class_handle, Address instance_address, const std::string& field_name) const;
    std::optional<float> ReadFloatField(Address class_handle, Address instance_address, const std::string& field_name) const;
    std::optional<Address> TryReadParentObjectAddress(Address game_object_address) const;
    std::optional<int> ReadSceneHandleForObject(Address game_object_address) const;
    std::optional<Vector3Snapshot> ReadVector3(Address boxed_value_address) const;
    std::optional<QuaternionSnapshot> ReadQuaternion(Address boxed_value_address) const;
    Address RequireUnboxed(Address boxed_object_address, const std::string& context) const;
    Address CreateManagedObject(Address class_handle, const std::string& context) const;
    std::string DescribeInvokeFailure(const RuntimeMethodInvokeResponse& response, const MethodRecord& method, const char* fallback) const;

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

    const RuntimeApi& api_;
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