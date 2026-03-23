#pragma once

#include <optional>
#include <string>

#include "runtime/api/RuntimeApi.h"

namespace bridge::runtime {

class FieldValueReader {
public:
    explicit FieldValueReader(const RuntimeApi& api);

    std::optional<std::string> ReadFieldValue(const FieldRecord& field, std::optional<Address> instance_address = std::nullopt) const;

private:
    const RuntimeApi& api_;
};

} // namespace bridge::runtime