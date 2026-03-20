#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge {

enum class BridgeOperation {
    InspectClass,
    InvokeMethod,
};

enum class InvokeValueKind {
    Null,
    Boolean,
    Number,
    String,
};

struct InvokeArgument {
    InvokeValueKind kind = InvokeValueKind::Null;
    std::optional<std::string> value;
};

struct InvokeValue {
    std::string kind;
    std::optional<std::string> value;
    std::optional<std::string> object_address;
};

struct BridgeRequest {
    BridgeOperation operation = BridgeOperation::InspectClass;
    std::size_t pid = 0;
    std::string image_name;
    std::string class_namespace;
    std::string class_name;
    std::optional<Address> instance_address;
    std::string method_name;
    std::string method_signature;
    std::vector<InvokeArgument> arguments;
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

struct RuntimeMethodInvokeResponse {
    bool success = false;
    std::string method_name;
    std::string method_signature;
    std::string return_type;
    std::optional<std::string> error;
    std::optional<std::string> exception;
    std::optional<InvokeValue> result;
};

} // namespace bridge