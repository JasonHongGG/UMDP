#include "mono/StaticValueReader.h"

#include <cstdint>

#include "mono/MonoRuntime.h"
#include "shared/Formatting.h"
#include "win32/Memory.h"

namespace bridge::mono {

StaticValueReader::StaticValueReader(const MonoRuntime& runtime)
    : runtime_(runtime)
{
}

bool StaticValueReader::SupportsDirectStaticRead(const std::string& type_name) const
{
    return type_name == "System.Boolean"
        || type_name == "System.Byte"
        || type_name == "System.SByte"
        || type_name == "System.Int16"
        || type_name == "System.UInt16"
        || type_name == "System.Int32"
        || type_name == "System.UInt32"
        || type_name == "System.Int64"
        || type_name == "System.UInt64"
        || type_name == "System.Single"
        || type_name == "System.Double";
}

std::optional<std::string> StaticValueReader::ReadStaticValue(const std::string& type_name, Address address) const
{
    if (address == 0) {
        return std::nullopt;
    }

    if (type_name == "System.Boolean") {
        return runtime_.memory().Read<std::uint8_t>(address) != 0 ? "true" : "false";
    }
    if (type_name == "System.Byte") {
        return std::to_string(static_cast<unsigned int>(runtime_.memory().Read<std::uint8_t>(address)));
    }
    if (type_name == "System.SByte") {
        return std::to_string(static_cast<int>(runtime_.memory().Read<std::int8_t>(address)));
    }
    if (type_name == "System.Int16") {
        return std::to_string(runtime_.memory().Read<std::int16_t>(address));
    }
    if (type_name == "System.UInt16") {
        return std::to_string(runtime_.memory().Read<std::uint16_t>(address));
    }
    if (type_name == "System.Int32") {
        return std::to_string(runtime_.memory().Read<std::int32_t>(address));
    }
    if (type_name == "System.UInt32") {
        return std::to_string(runtime_.memory().Read<std::uint32_t>(address));
    }
    if (type_name == "System.Int64") {
        return std::to_string(runtime_.memory().Read<std::int64_t>(address));
    }
    if (type_name == "System.UInt64") {
        return std::to_string(runtime_.memory().Read<std::uint64_t>(address));
    }
    if (type_name == "System.Single") {
        return std::to_string(runtime_.memory().Read<float>(address));
    }
    if (type_name == "System.Double") {
        return std::to_string(runtime_.memory().Read<double>(address));
    }

    const Address pointer_value = runtime_.memory().Read<Address>(address);
    if (pointer_value == 0) {
        return std::nullopt;
    }

    return shared::HexAddress(pointer_value);
}

} // namespace bridge::mono