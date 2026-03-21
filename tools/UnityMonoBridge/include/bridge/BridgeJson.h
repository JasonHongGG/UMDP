#pragma once

#include <string>

#include "bridge/BridgeModels.h"

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response);
std::string SerializeResponse(const RuntimeMethodInvokeResponse& response);
std::string SerializeResponse(const RuntimeFieldSetResponse& response);

} // namespace bridge