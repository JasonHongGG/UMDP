#pragma once

#include "bridge/BridgeModels.h"

#include <memory>
#include <optional>
#include <vector>

#include "runtime/services/RuntimeInspector.h"

namespace bridge {

class ArgumentParser {
public:
    static BridgeRequest Parse(int argc, char* argv[]);
    static BridgeRequest Parse(const std::vector<std::string>& args);
};

class RuntimeBridge {
public:
    RuntimeClassOverlayResponse Execute(const BridgeRequest& request);
    RuntimeMethodInvokeResponse ExecuteInvoke(const BridgeRequest& request);
    RuntimeFieldSetResponse ExecuteSetField(const BridgeRequest& request);

private:
    runtime::RuntimeInspector& ResolveInspector(std::size_t pid);

    std::optional<std::size_t> active_pid_;
    std::unique_ptr<runtime::RuntimeInspector> inspector_;
};

} // namespace bridge