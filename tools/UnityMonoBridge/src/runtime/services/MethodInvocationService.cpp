#include "runtime/services/MethodInvocationService.h"

#include <Windows.h>

#include <cstdint>
#include <limits>
#include <memory>
#include <stdexcept>

#include "shared/Formatting.h"
#include "win32/RemoteMemory.h"

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

std::size_t PrimitiveSizeForType(const std::string& type_name)
{
    if (type_name == "System.Boolean" || type_name == "System.Byte" || type_name == "System.SByte") {
        return 1;
    }
    if (type_name == "System.Int16" || type_name == "System.UInt16") {
        return 2;
    }
    if (type_name == "System.Int32" || type_name == "System.UInt32" || type_name == "System.Single") {
        return 4;
    }
    if (type_name == "System.Int64" || type_name == "System.UInt64" || type_name == "System.Double" || type_name == "System.IntPtr" || type_name == "System.UIntPtr") {
        return 8;
    }

    return 0;
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
std::optional<InvokeValue> ReadPrimitiveResult(const RuntimeApi& api, const MethodRecord& method, Address result_object)
{
    T value{};
    if (!api.TryReadUnboxedValue(result_object, &value, sizeof(T))) {
        return std::nullopt;
    }

    if constexpr (std::is_same_v<T, bool>) {
        return InvokeValue { "boolean", value ? std::optional<std::string>("true") : std::optional<std::string>("false"), std::nullopt };
    }
    else if constexpr (std::is_floating_point_v<T>) {
        return InvokeValue { "number", std::optional<std::string>(std::to_string(value)), std::nullopt };
    }
    else {
        return InvokeValue { "number", std::optional<std::string>(std::to_string(value)), std::nullopt };
    }
}

} // namespace

MethodInvocationService::MethodInvocationService(const RuntimeApi& api, const win32::Memory& memory)
    : api_(api), memory_(memory)
{
}

std::optional<MethodRecord> MethodInvocationService::ResolveMethod(Address class_handle, const BridgeRequest& request) const
{
    const auto methods = api_.EnumerateMethods(class_handle);
    for (const auto& method : methods) {
        if (method.name == request.method_name && method.signature == request.method_signature) {
            return method;
        }
    }

    return std::nullopt;
}

RuntimeMethodInvokeResponse MethodInvocationService::InvokeClassMethod(Address class_handle, const BridgeRequest& request) const
{
    RuntimeMethodInvokeResponse response;
    response.method_name = request.method_name;
    response.method_signature = request.method_signature;

    const auto method = ResolveMethod(class_handle, request);
    if (!method.has_value()) {
        response.error = "method not found";
        return response;
    }

    response.return_type = method->return_type;

    if (!method->is_static && !request.instance_address.has_value()) {
        response.error = "instance address is required for non-static method";
        return response;
    }

    if (request.arguments.size() != method->parameters.size()) {
        response.error = "argument count does not match method signature";
        return response;
    }

    std::vector<std::unique_ptr<win32::RemoteAllocation>> argument_storage;
    std::vector<Address> argument_pointers;
    argument_storage.reserve(method->parameters.size());
    argument_pointers.reserve(method->parameters.size());

    for (std::size_t index = 0; index < method->parameters.size(); ++index) {
        const auto& parameter = method->parameters[index];
        const auto& argument = request.arguments[index];

        if (!argument.value.has_value()) {
            argument_pointers.push_back(0);
            continue;
        }

        if (IsStringType(parameter.type_name)) {
            argument_pointers.push_back(api_.CreateManagedString(*argument.value));
            continue;
        }

        const auto primitive_size = PrimitiveSizeForType(parameter.type_name);
        if (primitive_size == 0) {
            if (parameter.type_name == "System.Object") {
                argument_pointers.push_back(ParseAddress(*argument.value));
                continue;
            }

            response.error = "unsupported parameter type: " + parameter.type_name;
            return response;
        }

        argument_storage.emplace_back(std::make_unique<win32::RemoteAllocation>(memory_, primitive_size, PAGE_READWRITE));
        const Address storage_address = argument_storage.back()->address();

        if (parameter.type_name == "System.Boolean") {
            memory_.Write(storage_address, static_cast<std::uint8_t>(*argument.value == "true" ? 1 : 0));
        }
        else if (parameter.type_name == "System.Byte") {
            WriteParsedInteger<std::uint8_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.SByte") {
            WriteParsedInteger<std::int8_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.Int16") {
            WriteParsedInteger<std::int16_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.UInt16") {
            WriteParsedInteger<std::uint16_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.Int32") {
            WriteParsedInteger<std::int32_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.UInt32") {
            WriteParsedInteger<std::uint32_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.Int64") {
            WriteParsedInteger<std::int64_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.UInt64") {
            WriteParsedInteger<std::uint64_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter.type_name == "System.Single") {
            memory_.Write(storage_address, std::stof(*argument.value));
        }
        else if (parameter.type_name == "System.Double") {
            memory_.Write(storage_address, std::stod(*argument.value));
        }
        else if (parameter.type_name == "System.IntPtr" || parameter.type_name == "System.UIntPtr") {
            memory_.Write(storage_address, ParseAddress(*argument.value));
        }

        argument_pointers.push_back(storage_address);
    }

    win32::RemoteAllocation parameter_array(memory_, (std::max<std::size_t>)(std::size_t(1), argument_pointers.size()) * sizeof(Address), PAGE_READWRITE);
    if (!argument_pointers.empty()) {
        memory_.Write(parameter_array.address(), argument_pointers.data(), argument_pointers.size() * sizeof(Address));
    }

    win32::RemoteAllocation exception_storage(memory_, sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory_.Write(exception_storage.address(), zero);

    const Address result_object = api_.InvokeMethod(
        method->handle,
        method->is_static ? 0 : *request.instance_address,
        argument_pointers.empty() ? 0 : parameter_array.address(),
        exception_storage.address());

    const Address exception_object = memory_.Read<Address>(exception_storage.address());
    if (exception_object != 0) {
        response.exception = api_.DescribeException(exception_object).value_or(std::string("runtime exception"));
        return response;
    }

    response.success = true;

    if (method->return_type == "System.Void") {
        response.result = InvokeValue { "void", std::nullopt, std::nullopt };
        return response;
    }

    if (result_object == 0) {
        response.result = InvokeValue { "null", std::nullopt, std::nullopt };
        return response;
    }

    if (IsStringType(method->return_type)) {
        response.result = InvokeValue {
            "string",
            api_.ReadManagedString(result_object),
            std::optional<std::string>(std::string("0x") + shared::HexAddress(result_object)),
        };
        return response;
    }

    if (method->return_type == "System.Boolean") {
        response.result = ReadPrimitiveResult<bool>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Byte") {
        response.result = ReadPrimitiveResult<std::uint8_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.SByte") {
        response.result = ReadPrimitiveResult<std::int8_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Int16") {
        response.result = ReadPrimitiveResult<std::int16_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.UInt16") {
        response.result = ReadPrimitiveResult<std::uint16_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Int32") {
        response.result = ReadPrimitiveResult<std::int32_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.UInt32") {
        response.result = ReadPrimitiveResult<std::uint32_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Int64") {
        response.result = ReadPrimitiveResult<std::int64_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.UInt64") {
        response.result = ReadPrimitiveResult<std::uint64_t>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Single") {
        response.result = ReadPrimitiveResult<float>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.Double") {
        response.result = ReadPrimitiveResult<double>(api_, *method, result_object);
        return response;
    }
    if (method->return_type == "System.IntPtr" || method->return_type == "System.UIntPtr") {
        response.result = ReadPrimitiveResult<Address>(api_, *method, result_object);
        return response;
    }

    response.result = InvokeValue {
        "object",
        std::nullopt,
        std::optional<std::string>(std::string("0x") + shared::HexAddress(result_object)),
    };
    return response;
}

} // namespace bridge::runtime