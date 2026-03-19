#pragma once

#include "bridge/BridgeModels.h"
#include "runtime/context/RuntimeContext.h"
#include "runtime/services/AssemblyService.h"
#include "runtime/services/ClassService.h"
#include "runtime/services/FieldEnumerationService.h"
#include "runtime/services/FieldValueReader.h"

namespace bridge::runtime {

class RuntimeInspector {
public:
    explicit RuntimeInspector(std::size_t pid);

    RuntimeClassOverlayResponse InspectClass(const BridgeRequest& request) const;

private:
    RuntimeContext context_;
    AssemblyService assembly_service_;
    ClassService class_service_;
    FieldEnumerationService field_enumeration_service_;
    FieldValueReader field_value_reader_;
};

} // namespace bridge::runtime