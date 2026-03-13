#include "runtime/services/ClassService.h"

#include <algorithm>

namespace bridge::runtime {

ClassService::ClassService(const RuntimeApi& api)
    : api_(api)
{
}

Address ClassService::ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const
{
    return api_.ResolveClass(image, class_namespace, class_name);
}

std::vector<Address> ClassService::BuildClassHierarchy(Address klass) const
{
    std::vector<Address> hierarchy;
    while (klass != 0) {
        hierarchy.push_back(klass);
        klass = api_.GetParentClass(klass);
    }

    std::reverse(hierarchy.begin(), hierarchy.end());
    return hierarchy;
}

} // namespace bridge::runtime