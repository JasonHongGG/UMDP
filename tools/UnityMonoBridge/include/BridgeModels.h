#pragma once

#include <cstddef>
#include <optional>
#include <string>
#include <vector>

namespace bridge {

struct BridgeRequest {
    std::size_t pid = 0;
    std::string image_name;
    std::string class_namespace;
    std::string class_name;
};

struct FieldRow {
    std::string name;
    std::string field_type;
    std::optional<std::string> address;
    std::optional<std::string> value;
    std::optional<std::string> offset;
};

struct RuntimeClassOverlayResponse {
    std::vector<FieldRow> static_fields;
    std::vector<FieldRow> fields;
};

} // namespace bridge