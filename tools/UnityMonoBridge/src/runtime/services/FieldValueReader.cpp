#include "runtime/services/FieldValueReader.h"

#include "shared/Formatting.h"

namespace bridge::runtime {

FieldValueReader::FieldValueReader(const RuntimeApi& api)
    : api_(api)
{
}

std::optional<std::string> FieldValueReader::ReadFieldValue(const FieldRecord& field, std::optional<Address> instance_address) const
{
    const auto try_read = [&](void* buffer, std::size_t size) {
        if (field.is_static) {
            return api_.TryReadStaticFieldBytes(field, buffer, size);
        }

        if (!instance_address.has_value()) {
            return false;
        }

        return api_.TryReadInstanceFieldBytes(*instance_address, field, buffer, size);
    };

    if (field.type_name == "System.Boolean") {
        std::uint8_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(value == 0 ? "false" : "true") : std::nullopt;
    }
    if (field.type_name == "System.Byte") {
        std::uint8_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(static_cast<unsigned int>(value))) : std::nullopt;
    }
    if (field.type_name == "System.SByte") {
        std::int8_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(static_cast<int>(value))) : std::nullopt;
    }
    if (field.type_name == "System.Int16") {
        std::int16_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt16") {
        std::uint16_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Int32") {
        std::int32_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt32") {
        std::uint32_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Int64") {
        std::int64_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.UInt64") {
        std::uint64_t value = 0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Single") {
        float value = 0.0f;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }
    if (field.type_name == "System.Double") {
        double value = 0.0;
        return try_read(&value, sizeof(value)) ? std::optional<std::string>(std::to_string(value)) : std::nullopt;
    }

    Address pointer_value = 0;
    if (!try_read(&pointer_value, sizeof(pointer_value))) {
        return std::nullopt;
    }

    if (pointer_value == 0) {
        return std::string("null");
    }

    return std::string("0x") + shared::HexAddress(pointer_value);
}

} // namespace bridge::runtime