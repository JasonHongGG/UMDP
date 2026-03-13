#include "mono/ClassService.h"

#include <algorithm>
#include <stdexcept>

#include "mono/MonoRuntime.h"
#include "shared/StringUtils.h"
#include "win32/RemoteMemory.h"

namespace bridge::mono {

ClassService::ClassService(const MonoRuntime& runtime)
    : runtime_(runtime)
{
}

Address ClassService::ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const
{
    const auto [normalized_namespace, normalized_name] = shared::NormalizeClassName(class_namespace, class_name);
    win32::RemoteUtf8String namespace_arg(runtime_.memory(), normalized_namespace);
    win32::RemoteUtf8String class_arg(runtime_.memory(), normalized_name);

    if (const auto found = runtime_.TryExportAddress("mono_class_from_name_case"); found.has_value()) {
        if (const auto klass = runtime_.InvokeDirect(*found, { image, namespace_arg.address(), class_arg.address() }); klass != 0) {
            return klass;
        }
    }

    if (const auto klass = runtime_.Invoke("mono_class_from_name", { image, namespace_arg.address(), class_arg.address() }); klass != 0) {
        return klass;
    }

    throw std::runtime_error("class not found");
}

std::vector<Address> ClassService::BuildClassHierarchy(Address klass) const
{
    std::vector<Address> hierarchy;
    while (klass != 0) {
        hierarchy.push_back(klass);
        klass = runtime_.Invoke("mono_class_get_parent", { klass });
    }

    std::reverse(hierarchy.begin(), hierarchy.end());
    return hierarchy;
}

} // namespace bridge::mono