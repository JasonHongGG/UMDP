#include "runtime/context/RuntimeContext.h"

#include <stdexcept>

#include "runtime/api/Il2CppRuntimeApi.h"
#include "runtime/api/MonoRuntimeApi.h"

namespace bridge::runtime {

RuntimeContext::RuntimeContext(std::size_t pid)
    : process_(pid), memory_(process_)
{
    if (process_.FindModule({ L"mono.dll", L"mono-2.0-bdwgc.dll", L"mono-2.0-sgen.dll" }).has_value()) {
        api_ = std::make_unique<MonoRuntimeApi>(process_, memory_);
        return;
    }

    if (process_.FindModule({ L"GameAssembly.dll" }).has_value()) {
        api_ = std::make_unique<Il2CppRuntimeApi>(process_, memory_);
        return;
    }

    throw std::runtime_error("supported managed runtime module not found");
}

const RuntimeApi& RuntimeContext::api() const
{
    return *api_;
}

const win32::Memory& RuntimeContext::memory() const
{
    return memory_;
}

} // namespace bridge::runtime