#pragma once

#include <string>

#include "BridgeModels.h"

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response);

} // namespace bridge