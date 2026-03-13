#include "shared/Formatting.h"

#include <iomanip>
#include <sstream>

namespace bridge::shared {

std::string HexAddress(Address address)
{
    std::ostringstream stream;
    stream << std::hex << std::nouppercase << address;
    return stream.str();
}

std::string HexOffset(int offset)
{
    std::ostringstream stream;
    stream << std::hex << std::uppercase << std::setw(3) << std::setfill('0') << offset;
    return stream.str();
}

} // namespace bridge::shared