#pragma once

#include <vector>

#include "runtime/api/RuntimeApi.h"

namespace bridge::runtime {

class FieldEnumerationService {
public:
    explicit FieldEnumerationService(const RuntimeApi& api);

    void AppendClassFields(Address class_handle, std::vector<FieldRecord>& static_fields, std::vector<FieldRecord>& instance_fields) const;

private:
    const RuntimeApi& api_;
};

} // namespace bridge::runtime