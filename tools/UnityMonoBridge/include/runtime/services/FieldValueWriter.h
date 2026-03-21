#pragma once

#include "bridge/BridgeModels.h"
#include "runtime/api/RuntimeApi.h"
#include "runtime/services/FieldValueReader.h"
#include "win32/Memory.h"

namespace bridge::runtime {

class FieldValueWriter {
public:
    FieldValueWriter(const RuntimeApi& api, const win32::Memory& memory, const FieldValueReader& field_value_reader);

    RuntimeFieldSetResponse SetFieldValue(const FieldRecord& field, const BridgeRequest& request) const;

private:
    std::optional<Address> ResolveFieldAddress(const FieldRecord& field, const BridgeRequest& request) const;

    const RuntimeApi& api_;
    const win32::Memory& memory_;
    const FieldValueReader& field_value_reader_;
};

} // namespace bridge::runtime