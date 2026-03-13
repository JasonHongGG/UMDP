#pragma once

#include <string>
#include <vector>

#include "runtime/api/RuntimeApi.h"

namespace bridge::runtime {

class ClassService {
public:
    explicit ClassService(const RuntimeApi& api);

    Address ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const;
    std::vector<Address> BuildClassHierarchy(Address klass) const;

private:
    const RuntimeApi& api_;
};

} // namespace bridge::runtime