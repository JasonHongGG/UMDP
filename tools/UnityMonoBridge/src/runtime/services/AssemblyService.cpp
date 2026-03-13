#include "runtime/services/AssemblyService.h"

#include <stdexcept>

#include "shared/StringUtils.h"

namespace bridge::runtime {

AssemblyService::AssemblyService(const RuntimeApi& api)
    : api_(api)
{
}

Address AssemblyService::ResolveImage(const std::string& image_name) const
{
    const auto assemblies = api_.EnumerateAssemblies();
    const std::string expected = shared::ToLowerAscii(image_name);
    std::string without_extension = expected;
    if (without_extension.size() > 4 && without_extension.ends_with(".dll")) {
        without_extension.resize(without_extension.size() - 4);
    }

    for (const auto assembly : assemblies) {
        const Address image = api_.GetAssemblyImage(assembly);
        if (image == 0) {
            continue;
        }

        const auto actual_name = shared::ToLowerAscii(api_.GetImageName(image));
        if (actual_name == expected || actual_name == without_extension) {
            return image;
        }
    }

    throw std::runtime_error("image not found");
}

} // namespace bridge::runtime