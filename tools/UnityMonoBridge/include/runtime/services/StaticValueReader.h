#pragma once

#include <optional>
#include <string>

#include "runtime/api/RuntimeApi.h"

namespace bridge::runtime {

class StaticValueReader {
public:
    explicit StaticValueReader(const RuntimeApi& api);

    bool SupportsDirectStaticRead(const std::string& type_name) const;
    std::optional<std::string> ReadStaticValue(const FieldRecord& field) const;

private:
    const RuntimeApi& api_;
};

} // namespace bridge::runtime