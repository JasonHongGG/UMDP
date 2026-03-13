#pragma once

#include <string>

#include "runtime/api/RuntimeApi.h"

namespace bridge::runtime {

class AssemblyService {
public:
    explicit AssemblyService(const RuntimeApi& api);

    Address ResolveImage(const std::string& image_name) const;

private:
    const RuntimeApi& api_;
};

} // namespace bridge::runtime