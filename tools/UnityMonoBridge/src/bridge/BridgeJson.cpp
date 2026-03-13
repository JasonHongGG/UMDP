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

        if (include_runtime_values) {
            output << ",\"address\":";
            WriteOptionalString(output, row.address);
            output << ",\"value\":";
            WriteOptionalString(output, row.value);
        }
        else {
            output << ",\"offset\":";
            WriteOptionalString(output, row.offset);
        }

        output << '}';
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
    WriteFieldRows(output, response.fields, false);
    output << "]}";
    return output.str();
}

} // namespace bridge