#include "mono/AssemblyService.h"

#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "mono/MonoRuntime.h"
#include "shared/StringUtils.h"
#include "win32/Memory.h"
#include "win32/RemoteMemory.h"

namespace bridge::mono {

AssemblyService::AssemblyService(const MonoRuntime& runtime)
    : runtime_(runtime)
{
}

Address AssemblyService::ResolveImage(const std::string& image_name) const
{
    const auto assemblies = EnumerateAssemblies();
    const std::string expected = shared::ToLowerAscii(image_name);
    std::string without_extension = expected;
    if (without_extension.size() > 4 && without_extension.ends_with(".dll")) {
        without_extension.resize(without_extension.size() - 4);
    }

    for (const auto assembly : assemblies) {
        const Address image = runtime_.Invoke("mono_assembly_get_image", { assembly });
        if (image == 0) {
            continue;
        }

        const auto actual_name = shared::ToLowerAscii(runtime_.InvokeString("mono_image_get_name", { image }));
        if (actual_name == expected || actual_name == without_extension) {
            return image;
        }
    }

    throw std::runtime_error("image not found");
}

std::vector<Address> AssemblyService::EnumerateAssemblies() const
{
    struct AssemblyCollector {
        std::uint32_t count = 0;
        std::uint32_t reserved = 0;
        Address handles[510]{};
    };

    static constexpr std::array<std::uint8_t, 17> callback_code = {
        0x8B, 0x02, 0x3D, 0xFE, 0x01, 0x00, 0x00, 0x77, 0x07,
        0x48, 0x89, 0x4C, 0xC2, 0x08, 0xFF, 0x02, 0xC3,
    };

    win32::RemoteAllocation block(runtime_.memory(), 4096, PAGE_EXECUTE_READWRITE);
    const Address callback_address = block.address() + 0x100;
    const Address data_address = block.address() + 0x200;

    AssemblyCollector collector{};
    runtime_.memory().Write(callback_address, callback_code.data(), callback_code.size());
    runtime_.memory().Write(data_address, collector);
    runtime_.Invoke("mono_assembly_foreach", { callback_address, data_address });
    collector = runtime_.memory().Read<AssemblyCollector>(data_address);

    const auto count = (std::min<std::size_t>)(collector.count, std::size(collector.handles));
    return std::vector<Address>(collector.handles, collector.handles + count);
}

} // namespace bridge::mono