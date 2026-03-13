#pragma once

#include <string>

#include "bridge/BridgeModels.h"

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response);

} // namespace bridge