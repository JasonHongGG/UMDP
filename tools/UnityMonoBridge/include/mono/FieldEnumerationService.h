#pragma once

#include <optional>
#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge::mono {

class MonoRuntime;

struct FieldRecord {
    std::string name;
    std::string type_name;
    bool is_static = false;
    std::optional<Address> static_address;
    int offset = 0;
};

class FieldEnumerationService {
public:
    explicit FieldEnumerationService(const MonoRuntime& runtime);

    void AppendClassFields(Address class_handle, std::vector<FieldRecord>& static_fields, std::vector<FieldRecord>& instance_fields) const;

private:
    Address ResolveStaticFieldAddress(Address class_handle, int field_offset) const;

    const MonoRuntime& runtime_;
};

} // namespace bridge::mono