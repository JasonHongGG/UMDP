#include "runtime/services/StaticValueReader.h"

#include <cstdint>

#include "shared/Formatting.h"

namespace bridge::runtime {

StaticValueReader::StaticValueReader(const RuntimeApi& api)
    : api_(api)
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

std::optional<std::string> StaticValueReader::ReadStaticValue(const FieldRecord& field) const
{
    if (field.type_name == "System.Boolean") {
        std::uint8_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value))
            ? std::optional<std::string>(value != 0 ? "true" : "false")
            : std::nullopt;
    }
    if (field.type_name == "System.Byte") {
        std::uint8_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(static_cast<unsigned int>(value))) : std::nullopt;
    }
    if (field.type_name == "System.SByte") {
        std::int8_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(static_cast<int>(value))) : std::nullopt;
    }
    if (field.type_name == "System.Int16") {
        std::int16_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt16") {
        std::uint16_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Int32") {
        std::int32_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt32") {
        std::uint32_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Int64") {
        std::int64_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt64") {
        std::uint64_t value = 0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Single") {
        float value = 0.0f;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Double") {
        double value = 0.0;
        return api_.TryReadStaticFieldBytes(field, &value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }

    Address pointer_value = 0;
    if (!api_.TryReadStaticFieldBytes(field, &pointer_value, sizeof(pointer_value)) || pointer_value == 0) {
        return std::nullopt;
    }

    return shared::HexAddress(pointer_value);
}

} // namespace bridge::runtime