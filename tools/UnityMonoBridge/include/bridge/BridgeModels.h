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
    SetField,
};

enum class InvokeValueKind {
    Null,
    Boolean,
    Number,
    String,
    Address,
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

enum class FieldValueKind {
    Null,
    Boolean,
    Integer,
    Float,
    String,
    Address,
};

enum class RuntimeFieldSetFailureKind {
    None,
    FieldNotFound,
    InstanceRequired,
    AddressMismatch,
    UnsupportedType,
    InvalidValue,
    WriteFailed,
    Unknown,
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
    std::string field_name;
    std::string field_type_name;
    bool field_is_static = false;
    std::optional<Address> target_address;
    FieldValueKind field_value_kind = FieldValueKind::Null;
    std::optional<std::string> field_value;
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

struct RuntimeFieldSetResponse {
    bool success = false;
    RuntimeFieldSetFailureKind failure_kind = RuntimeFieldSetFailureKind::Unknown;
    std::string field_name;
    std::string field_type;
    bool is_static = false;
    std::optional<std::string> address;
    std::optional<std::string> error;
    std::optional<std::string> previous_value;
    std::optional<std::string> applied_value;
};

} // namespace bridge