#pragma once

#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge::mono {

class MonoRuntime;

class ClassService {
public:
    explicit ClassService(const MonoRuntime& runtime);

    Address ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const;
    std::vector<Address> BuildClassHierarchy(Address klass) const;

private:
    const MonoRuntime& runtime_;
};

} // namespace bridge::mono