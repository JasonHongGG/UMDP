#pragma once

#include "bridge/BridgeModels.h"

namespace bridge {

class ArgumentParser {
public:
    static BridgeRequest Parse(int argc, char* argv[]);
};

class RuntimeBridge {
public:
    RuntimeClassOverlayResponse Execute(const BridgeRequest& request) const;
    RuntimeMethodInvokeResponse ExecuteInvoke(const BridgeRequest& request) const;
};

} // namespace bridge