#pragma once

#include "bridge/BridgeModels.h"
#include "mono/AssemblyService.h"
#include "mono/ClassService.h"
#include "mono/FieldEnumerationService.h"
#include "mono/MonoRuntime.h"
#include "mono/StaticValueReader.h"

namespace bridge::mono {

class RuntimeInspector {
public:
    explicit RuntimeInspector(std::size_t pid);

    RuntimeClassOverlayResponse InspectClass(const BridgeRequest& request) const;

private:
    MonoRuntime runtime_;
    AssemblyService assembly_service_;
    ClassService class_service_;
    FieldEnumerationService field_enumeration_service_;
    StaticValueReader static_value_reader_;
};

} // namespace bridge::mono