#pragma once

#include <string>

#include "shared/Types.h"

namespace bridge::shared {

std::string HexAddress(Address address);
std::string HexOffset(int offset);

} // namespace bridge::shared