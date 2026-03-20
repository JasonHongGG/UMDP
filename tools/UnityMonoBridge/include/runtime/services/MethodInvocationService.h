#pragma once

#include <optional>

#include "bridge/BridgeModels.h"
#include "runtime/api/RuntimeApi.h"
#include "win32/Memory.h"

namespace bridge::runtime {

class MethodInvocationService {
public:
    MethodInvocationService(const RuntimeApi& api, const win32::Memory& memory);

    RuntimeMethodInvokeResponse InvokeClassMethod(
        Address class_handle,
        const BridgeRequest& request) const;

private:
    std::optional<MethodRecord> ResolveMethod(Address class_handle, const BridgeRequest& request) const;

    const RuntimeApi& api_;
    const win32::Memory& memory_;
};

} // namespace bridge::runtime