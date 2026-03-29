#pragma once

#include "bridge/BridgeModels.h"
#include "runtime/context/RuntimeContext.h"
#include "runtime/services/AssemblyService.h"
#include "runtime/services/ClassService.h"
#include "runtime/services/FieldEnumerationService.h"
#include "runtime/services/FieldValueWriter.h"
#include "runtime/services/FieldValueReader.h"
#include "runtime/services/MethodInvocationService.h"
#include "runtime/services/SceneService.h"

namespace bridge::runtime {

class RuntimeInspector {
public:
    explicit RuntimeInspector(std::size_t pid);

    RuntimeClassOverlayResponse InspectClass(const BridgeRequest& request) const;
    RuntimeMethodInvokeResponse InvokeClassMethod(const BridgeRequest& request) const;
    RuntimeFieldSetResponse SetFieldValue(const BridgeRequest& request) const;
    SceneCatalogResponse LoadSceneCatalog(const BridgeRequest& request) const;
    SceneChildrenResponse LoadSceneChildren(const BridgeRequest& request) const;
    SceneObjectInspectorResponse InspectSceneObject(const BridgeRequest& request) const;
    SceneMutationResponse MutateSceneObject(const BridgeRequest& request) const;

private:
    RuntimeContext context_;
    AssemblyService assembly_service_;
    ClassService class_service_;
    FieldEnumerationService field_enumeration_service_;
    FieldValueReader field_value_reader_;
    FieldValueWriter field_value_writer_;
    MethodInvocationService method_invocation_service_;
    SceneService scene_service_;
};

} // namespace bridge::runtime