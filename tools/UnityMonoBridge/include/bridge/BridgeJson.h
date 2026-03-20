#pragma once

#include <string>

#include "bridge/BridgeModels.h"

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response);
std::string SerializeResponse(const RuntimeMethodInvokeResponse& response);

} // namespace bridge