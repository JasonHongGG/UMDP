#include "bridge/BridgeJson.h"

#include <iomanip>
#include <sstream>

namespace {

std::string JsonEscape(const std::string& value)
{
    std::ostringstream stream;
    for (const char ch : value) {
        switch (ch) {
        case '\\': stream << "\\\\"; break;
        case '"': stream << "\\\""; break;
        case '\n': stream << "\\n"; break;
        case '\r': stream << "\\r"; break;
        case '\t': stream << "\\t"; break;
        default:
            if (static_cast<unsigned char>(ch) < 0x20 || static_cast<unsigned char>(ch) >= 0x7F) {
                stream << "\\u"
                       << std::hex << std::setw(4) << std::setfill('0')
                       << static_cast<int>(static_cast<unsigned char>(ch))
                       << std::dec;
            }
            else {
                stream << ch;
            }
            break;
        }
    }

    return stream.str();
}

void WriteOptionalString(std::ostringstream& output, const std::optional<std::string>& value)
{
    if (value.has_value()) {
        output << '"' << JsonEscape(*value) << '"';
    }
    else {
        output << "null";
    }
}

void WriteFieldRows(std::ostringstream& output, const std::vector<bridge::FieldRow>& rows, bool include_runtime_values)
{
    for (std::size_t index = 0; index < rows.size(); ++index) {
        if (index > 0) {
            output << ',';
        }

        const auto& row = rows[index];
        output << '{'
               << "\"name\":\"" << JsonEscape(row.name) << "\"," 
               << "\"field_type\":\"" << JsonEscape(row.field_type) << "\"";

        output << ",\"offset\":";
        WriteOptionalString(output, row.offset);

        if (include_runtime_values) {
            output << ",\"address\":";
            WriteOptionalString(output, row.address);
            output << ",\"value\":";
            WriteOptionalString(output, row.value);
        }

        output << '}';
    }
}

void WriteInvokeValue(std::ostringstream& output, const bridge::InvokeValue& value)
{
    output << '{'
           << "\"kind\":\"" << JsonEscape(value.kind) << "\",";
    output << "\"value\":";
    WriteOptionalString(output, value.value);
    output << ",\"object_address\":";
    WriteOptionalString(output, value.object_address);
    output << '}';
}

std::string FailureKindToString(bridge::RuntimeFieldSetFailureKind kind)
{
    switch (kind) {
    case bridge::RuntimeFieldSetFailureKind::None:
        return "none";
    case bridge::RuntimeFieldSetFailureKind::FieldNotFound:
        return "field-not-found";
    case bridge::RuntimeFieldSetFailureKind::InstanceRequired:
        return "instance-required";
    case bridge::RuntimeFieldSetFailureKind::AddressMismatch:
        return "address-mismatch";
    case bridge::RuntimeFieldSetFailureKind::UnsupportedType:
        return "unsupported-type";
    case bridge::RuntimeFieldSetFailureKind::InvalidValue:
        return "invalid-value";
    case bridge::RuntimeFieldSetFailureKind::WriteFailed:
        return "write-failed";
    default:
        return "unknown";
    }
}

} // namespace

namespace bridge {

std::string SerializeResponse(const RuntimeClassOverlayResponse& response)
{
    std::ostringstream output;
    output << "{\"static_fields\":[";
    WriteFieldRows(output, response.static_fields, true);
    output << "],\"fields\":[";
    WriteFieldRows(output, response.fields, true);
    output << "]}";
    return output.str();
}

std::string SerializeResponse(const RuntimeMethodInvokeResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"success\":" << (response.success ? "true" : "false") << ','
           << "\"method_name\":\"" << JsonEscape(response.method_name) << "\"," 
           << "\"method_signature\":\"" << JsonEscape(response.method_signature) << "\"," 
           << "\"return_type\":\"" << JsonEscape(response.return_type) << "\",";
    output << "\"error\":";
    WriteOptionalString(output, response.error);
    output << ",\"exception\":";
    WriteOptionalString(output, response.exception);
    output << ",\"result\":";
    if (response.result.has_value()) {
        WriteInvokeValue(output, *response.result);
    }
    else {
        output << "null";
    }
    output << '}';
    return output.str();
}

std::string SerializeResponse(const RuntimeFieldSetResponse& response)
{
    std::ostringstream output;
    output << '{'
           << "\"success\":" << (response.success ? "true" : "false") << ','
           << "\"failure_kind\":\"" << JsonEscape(FailureKindToString(response.failure_kind)) << "\"," 
           << "\"field_name\":\"" << JsonEscape(response.field_name) << "\"," 
           << "\"field_type\":\"" << JsonEscape(response.field_type) << "\"," 
           << "\"is_static\":" << (response.is_static ? "true" : "false") << ',';
    output << "\"address\":";
    WriteOptionalString(output, response.address);
    output << ",\"error\":";
    WriteOptionalString(output, response.error);
    output << ",\"previous_value\":";
    WriteOptionalString(output, response.previous_value);
    output << ",\"applied_value\":";
    WriteOptionalString(output, response.applied_value);
    output << '}';
    return output.str();
}

} // namespace bridge