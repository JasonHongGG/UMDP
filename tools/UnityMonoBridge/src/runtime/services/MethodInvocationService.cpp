#include "runtime/services/MethodInvocationService.h"

#include <Windows.h>

#include <algorithm>
#include <cstdint>
#include <limits>
#include <memory>
#include <stdexcept>
#include <vector>

#include "shared/Formatting.h"
#include "win32/RemoteMemory.h"

namespace bridge::runtime {

namespace {

std::string Trim(std::string value)
{
    const auto start = value.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) {
        return std::string();
    }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(start, end - start + 1);
}

bool IsIdentifier(const std::string& value)
{
    if (value.empty()) {
        return false;
    }
    const auto is_alpha = [](unsigned char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); };
    const auto is_digit = [](unsigned char c) { return c >= '0' && c <= '9'; };
    const auto is_ident_char = [&](unsigned char c) { return is_alpha(c) || is_digit(c) || c == '_'; };

    const unsigned char first = static_cast<unsigned char>(value[0]);
    if (!(is_alpha(first) || first == '_')) {
        return false;
    }
    for (std::size_t i = 1; i < value.size(); ++i) {
        if (!is_ident_char(static_cast<unsigned char>(value[i]))) {
            return false;
        }
    }
    return true;
}

std::vector<std::string> SplitTopLevelCommaSeparated(const std::string& value)
{
    std::vector<std::string> parts;
    std::string current;
    current.reserve(value.size());

    int generic_depth = 0;
    for (char ch : value) {
        if (ch == '<') {
            ++generic_depth;
        }
        else if (ch == '>' && generic_depth > 0) {
            --generic_depth;
        }

        if (ch == ',' && generic_depth == 0) {
            parts.push_back(Trim(current));
            current.clear();
            continue;
        }
        current.push_back(ch);
    }

    if (!current.empty() || !parts.empty()) {
        parts.push_back(Trim(current));
    }

    // Drop empty segments (e.g. no-arg signatures)
    parts.erase(std::remove_if(parts.begin(), parts.end(), [](const std::string& p) { return p.empty(); }), parts.end());
    return parts;
}

std::optional<std::pair<std::string, std::vector<std::string>>> ParseSignatureTypes(const std::string& signature)
{
    const auto open = signature.find('(');
    if (open == std::string::npos) {
        return std::nullopt;
    }
    const auto close = signature.rfind(')');
    if (close == std::string::npos || close < open) {
        return std::nullopt;
    }

    const std::string return_type = Trim(signature.substr(0, open));
    std::string params_blob = Trim(signature.substr(open + 1, close - open - 1));
    std::vector<std::string> param_types;

    if (!params_blob.empty()) {
        const auto params = SplitTopLevelCommaSeparated(params_blob);
        param_types.reserve(params.size());
        for (const auto& param : params) {
            // Our runtime signatures are formatted as: "Type" or "Type name".
            // Some runtimes strip parameter names; we must ignore names when resolving.
            const auto last_space = param.find_last_of(' ');
            if (last_space == std::string::npos) {
                param_types.push_back(Trim(param));
                continue;
            }

            const auto maybe_name = Trim(param.substr(last_space + 1));
            const auto maybe_type = Trim(param.substr(0, last_space));
            if (!maybe_type.empty() && IsIdentifier(maybe_name)) {
                param_types.push_back(maybe_type);
            }
            else {
                param_types.push_back(Trim(param));
            }
        }
    }

    if (return_type.empty()) {
        return std::nullopt;
    }

    return std::make_pair(return_type, param_types);
}

std::string NormalizeTypeName(std::string value)
{
    value = Trim(std::move(value));
    if (value.empty()) {
        return value;
    }

    // Preserve common suffixes (arrays/pointers/byref) while normalizing the base.
    std::string suffix;
    while (true) {
        if (value.size() >= 2 && value.compare(value.size() - 2, 2, "[]") == 0) {
            suffix.insert(0, "[]");
            value.resize(value.size() - 2);
            value = Trim(value);
            continue;
        }
        if (!value.empty() && (value.back() == '&' || value.back() == '*')) {
            suffix.insert(0, std::string(1, value.back()));
            value.pop_back();
            value = Trim(value);
            continue;
        }
        break;
    }

    auto map_alias = [](const std::string& base) -> std::string {
        if (base == "void") return "System.Void";
        if (base == "bool") return "System.Boolean";
        if (base == "byte") return "System.Byte";
        if (base == "sbyte") return "System.SByte";
        if (base == "short") return "System.Int16";
        if (base == "ushort") return "System.UInt16";
        if (base == "int") return "System.Int32";
        if (base == "uint") return "System.UInt32";
        if (base == "long") return "System.Int64";
        if (base == "ulong") return "System.UInt64";
        if (base == "float") return "System.Single";
        if (base == "double") return "System.Double";
        if (base == "string") return "System.String";
        if (base == "object") return "System.Object";
        return base;
    };

    // If the entire base is a simple alias, normalize it.
    std::string normalized = map_alias(value);

    // Also normalize obvious aliases inside generic argument lists like List<int>.
    // We only rewrite bare identifiers that match an alias (no dots), to avoid touching full names.
    {
        std::string rebuilt;
        rebuilt.reserve(normalized.size());

        std::string token;
        auto flush_token = [&]() {
            if (token.empty()) {
                return;
            }
            // Only rewrite bare identifiers (no namespace dots).
            if (token.find('.') == std::string::npos) {
                token = map_alias(token);
            }
            rebuilt += token;
            token.clear();
        };

        for (char ch : normalized) {
            const bool is_word = (ch >= 'A' && ch <= 'Z')
                || (ch >= 'a' && ch <= 'z')
                || (ch >= '0' && ch <= '9')
                || ch == '_'
                || ch == '.';
            if (is_word) {
                token.push_back(ch);
                continue;
            }
            flush_token();
            rebuilt.push_back(ch);
        }
        flush_token();
        normalized = std::move(rebuilt);
    }

    return normalized + suffix;
}

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

    // Fallback: match by return type + parameter types only.
    // In IL2CPP/release builds, parameter names are often unavailable at runtime, which makes
    // signature string comparisons too strict (e.g. "System.Void (System.Int32 value)" vs "System.Void (System.Int32)").
    const auto parsed = ParseSignatureTypes(request.method_signature);
    if (!parsed.has_value()) {
        return std::nullopt;
    }

    const auto expected_return_type = NormalizeTypeName(parsed->first);
    std::vector<std::string> expected_parameter_types;
    expected_parameter_types.reserve(parsed->second.size());
    for (const auto& p : parsed->second) {
        expected_parameter_types.push_back(NormalizeTypeName(p));
    }

    for (const auto& method : methods) {
        if (method.name != request.method_name) {
            continue;
        }
        if (NormalizeTypeName(method.return_type) != expected_return_type) {
            continue;
        }
        if (method.parameters.size() != expected_parameter_types.size()) {
            continue;
        }

        bool match = true;
        for (std::size_t i = 0; i < expected_parameter_types.size(); ++i) {
            if (NormalizeTypeName(method.parameters[i].type_name) != expected_parameter_types[i]) {
                match = false;
                break;
            }
        }
        if (match) {
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

        const auto parameter_type = NormalizeTypeName(parameter.type_name);

        if (!argument.value.has_value()) {
            argument_pointers.push_back(0);
            continue;
        }

        if (IsStringType(parameter_type)) {
            argument_pointers.push_back(api_.CreateManagedString(*argument.value));
            continue;
        }

        const auto primitive_size = PrimitiveSizeForType(parameter_type);
        if (primitive_size == 0) {
            if (parameter_type == "System.Object") {
                argument_pointers.push_back(ParseAddress(*argument.value));
                continue;
            }

            response.error = "unsupported parameter type: " + parameter.type_name;
            return response;
        }

        argument_storage.emplace_back(std::make_unique<win32::RemoteAllocation>(memory_, primitive_size, PAGE_READWRITE));
        const Address storage_address = argument_storage.back()->address();

        if (parameter_type == "System.Boolean") {
            memory_.Write(storage_address, static_cast<std::uint8_t>(*argument.value == "true" ? 1 : 0));
        }
        else if (parameter_type == "System.Byte") {
            WriteParsedInteger<std::uint8_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.SByte") {
            WriteParsedInteger<std::int8_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.Int16") {
            WriteParsedInteger<std::int16_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.UInt16") {
            WriteParsedInteger<std::uint16_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.Int32") {
            WriteParsedInteger<std::int32_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.UInt32") {
            WriteParsedInteger<std::uint32_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.Int64") {
            WriteParsedInteger<std::int64_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.UInt64") {
            WriteParsedInteger<std::uint64_t>(memory_, storage_address, *argument.value);
        }
        else if (parameter_type == "System.Single") {
            memory_.Write(storage_address, std::stof(*argument.value));
        }
        else if (parameter_type == "System.Double") {
            memory_.Write(storage_address, std::stod(*argument.value));
        }
        else if (parameter_type == "System.IntPtr" || parameter_type == "System.UIntPtr") {
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

    const auto return_type = NormalizeTypeName(method->return_type);
    if (return_type == "System.Void") {
        response.result = InvokeValue { "void", std::nullopt, std::nullopt };
        return response;
    }

    if (result_object == 0) {
        response.result = InvokeValue { "null", std::nullopt, std::nullopt };
        return response;
    }

    if (IsStringType(return_type)) {
        response.result = InvokeValue {
            "string",
            api_.ReadManagedString(result_object),
            std::optional<std::string>(std::string("0x") + shared::HexAddress(result_object)),
        };
        return response;
    }

    if (return_type == "System.Boolean") {
        response.result = ReadPrimitiveResult<bool>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Byte") {
        response.result = ReadPrimitiveResult<std::uint8_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.SByte") {
        response.result = ReadPrimitiveResult<std::int8_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Int16") {
        response.result = ReadPrimitiveResult<std::int16_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.UInt16") {
        response.result = ReadPrimitiveResult<std::uint16_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Int32") {
        response.result = ReadPrimitiveResult<std::int32_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.UInt32") {
        response.result = ReadPrimitiveResult<std::uint32_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Int64") {
        response.result = ReadPrimitiveResult<std::int64_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.UInt64") {
        response.result = ReadPrimitiveResult<std::uint64_t>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Single") {
        response.result = ReadPrimitiveResult<float>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.Double") {
        response.result = ReadPrimitiveResult<double>(api_, *method, result_object);
        return response;
    }
    if (return_type == "System.IntPtr" || return_type == "System.UIntPtr") {
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