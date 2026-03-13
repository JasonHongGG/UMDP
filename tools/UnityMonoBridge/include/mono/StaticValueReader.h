#pragma once

#include <optional>
#include <string>

#include "shared/Types.h"

namespace bridge::mono {

class MonoRuntime;

class StaticValueReader {
public:
    explicit StaticValueReader(const MonoRuntime& runtime);

    bool SupportsDirectStaticRead(const std::string& type_name) const;
    std::optional<std::string> ReadStaticValue(const std::string& type_name, Address address) const;

private:
    const MonoRuntime& runtime_;
};

} // namespace bridge::mono