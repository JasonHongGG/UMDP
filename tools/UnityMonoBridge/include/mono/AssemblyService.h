#pragma once

#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge::mono {

class MonoRuntime;

class AssemblyService {
public:
    explicit AssemblyService(const MonoRuntime& runtime);

    Address ResolveImage(const std::string& image_name) const;

private:
    std::vector<Address> EnumerateAssemblies() const;

    const MonoRuntime& runtime_;
};

} // namespace bridge::mono