#pragma once

#include <memory>

#include "runtime/api/RuntimeApi.h"
#include "win32/Memory.h"
#include "win32/Process.h"

namespace bridge::runtime {

class RuntimeContext {
public:
    explicit RuntimeContext(std::size_t pid);

    RuntimeContext(const RuntimeContext&) = delete;
    RuntimeContext& operator=(const RuntimeContext&) = delete;

    const RuntimeApi& api() const;
    const win32::Memory& memory() const;

private:
    win32::Process process_;
    win32::Memory memory_;
    std::unique_ptr<RuntimeApi> api_;
};

} // namespace bridge::runtime