#include "runtime/services/FieldValueWriter.h"

#include <Windows.h>

#include <cstdint>
#include <stdexcept>
#include <type_traits>

#include "shared/Formatting.h"

namespace bridge::runtime {

namespace {

bool IsIntegerType(const std::string& type_name)
{
    return type_name == "System.Byte"
        || type_name == "System.SByte"
        || type_name == "System.Int16"
        || type_name == "System.UInt16"
        || type_name == "System.Int32"
        || type_name == "System.UInt32"
        || type_name == "System.Int64"
        || type_name == "System.UInt64"
        || type_name == "System.IntPtr"
        || type_name == "System.UIntPtr";
}

bool IsFloatingPointType(const std::string& type_name)
{
    return type_name == "System.Single" || type_name == "System.Double";
}

bool IsStringType(const std::string& type_name)
{
    return type_name == "System.String";
}

Address ParseAddress(const std::string& value)
{
    return static_cast<Address>(std::stoull(value, nullptr, 0));
}

template <typename T>
void WriteParsedInteger(const win32::Memory& memory, Address address, const std::string& value)
{
    if constexpr (std::is_signed_v<T>) {
        memory.Write(address, static_cast<T>(std::stoll(value, nullptr, 0)));
    }
    else {
        memory.Write(address, static_cast<T>(std::stoull(value, nullptr, 0)));
    }
}

template <typename T>
void WriteProtectedValue(const win32::Memory& memory, Address address, const T& value)
{
    const auto previous_protection = memory.Protect(address, sizeof(T), PAGE_EXECUTE_READWRITE);
    try {
        memory.Write(address, value);
    }
    catch (...) {
        memory.Protect(address, sizeof(T), previous_protection);
        throw;
    }
    memory.Protect(address, sizeof(T), previous_protection);
}

void WriteProtectedBuffer(const win32::Memory& memory, Address address, const void* buffer, std::size_t size)
{
    const auto previous_protection = memory.Protect(address, size, PAGE_EXECUTE_READWRITE);
    try {
        memory.Write(address, buffer, size);
    }
    catch (...) {
        memory.Protect(address, size, previous_protection);
        throw;
    }
    memory.Protect(address, size, previous_protection);
}

} // namespace

FieldValueWriter::FieldValueWriter(const RuntimeApi& api, const win32::Memory& memory, const FieldValueReader& field_value_reader)
    : api_(api), memory_(memory), field_value_reader_(field_value_reader)
{
}

std::optional<Address> FieldValueWriter::ResolveFieldAddress(const FieldRecord& field, const BridgeRequest& request) const
{
    if (field.is_static) {
        return field.static_address;
    }
    if (!request.instance_address.has_value()) {
        return std::nullopt;
    }

    return *request.instance_address + static_cast<Address>(field.offset);
}

RuntimeFieldSetResponse FieldValueWriter::SetFieldValue(const FieldRecord& field, const BridgeRequest& request) const
{
    RuntimeFieldSetResponse response;
    response.field_name = field.name;
    response.field_type = field.type_name;
    response.is_static = field.is_static;

    const auto resolved_address = ResolveFieldAddress(field, request);
    if (!resolved_address.has_value()) {
        response.failure_kind = RuntimeFieldSetFailureKind::InstanceRequired;
        response.error = "instance address is required for non-static field";
        return response;
    }

    response.address = shared::HexAddress(*resolved_address);

    if (request.target_address.has_value() && *request.target_address != *resolved_address) {
        response.failure_kind = RuntimeFieldSetFailureKind::AddressMismatch;
        response.error = "resolved field address does not match target address";
        return response;
    }

    response.previous_value = field_value_reader_.ReadFieldValue(field, request.instance_address);

    try {
        if (field.type_name == "System.Boolean") {
            if (!request.field_value.has_value()) {
                throw std::runtime_error("missing boolean value");
            }
            const std::uint8_t value = *request.field_value == "true" ? 1 : 0;
            WriteProtectedValue(memory_, *resolved_address, value);
        }
        else if (field.type_name == "System.Byte") {
            WriteParsedInteger<std::uint8_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.SByte") {
            WriteParsedInteger<std::int8_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.Int16") {
            WriteParsedInteger<std::int16_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.UInt16") {
            WriteParsedInteger<std::uint16_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.Int32") {
            WriteParsedInteger<std::int32_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.UInt32") {
            WriteParsedInteger<std::uint32_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.Int64") {
            WriteParsedInteger<std::int64_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.UInt64") {
            WriteParsedInteger<std::uint64_t>(memory_, *resolved_address, request.field_value.value());
        }
        else if (field.type_name == "System.Single") {
            WriteProtectedValue(memory_, *resolved_address, std::stof(request.field_value.value()));
        }
        else if (field.type_name == "System.Double") {
            WriteProtectedValue(memory_, *resolved_address, std::stod(request.field_value.value()));
        }
        else if (field.type_name == "System.IntPtr" || field.type_name == "System.UIntPtr") {
            const Address value = ParseAddress(request.field_value.value());
            WriteProtectedValue(memory_, *resolved_address, value);
        }
        else if (IsStringType(field.type_name)) {
            const Address string_object = api_.CreateManagedString(request.field_value.value_or(std::string()));
            WriteProtectedBuffer(memory_, *resolved_address, &string_object, sizeof(string_object));
        }
        else if (IsIntegerType(field.type_name) || IsFloatingPointType(field.type_name)) {
            response.failure_kind = RuntimeFieldSetFailureKind::UnsupportedType;
            response.error = "unsupported field type: " + field.type_name;
            return response;
        }
        else {
            response.failure_kind = RuntimeFieldSetFailureKind::UnsupportedType;
            response.error = "unsupported field type: " + field.type_name;
            return response;
        }
    }
    catch (const std::invalid_argument& error) {
        response.failure_kind = RuntimeFieldSetFailureKind::InvalidValue;
        response.error = error.what();
        return response;
    }
    catch (const std::out_of_range& error) {
        response.failure_kind = RuntimeFieldSetFailureKind::InvalidValue;
        response.error = error.what();
        return response;
    }
    catch (const std::exception& error) {
        response.failure_kind = RuntimeFieldSetFailureKind::WriteFailed;
        response.error = error.what();
        return response;
    }

    response.success = true;
    response.failure_kind = RuntimeFieldSetFailureKind::None;
    response.applied_value = field_value_reader_.ReadFieldValue(field, request.instance_address);
    return response;
}

} // namespace bridge::runtime