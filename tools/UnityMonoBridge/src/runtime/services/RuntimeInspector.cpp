#include "runtime/services/RuntimeInspector.h"

#include "shared/Formatting.h"

namespace bridge::runtime {

RuntimeInspector::RuntimeInspector(std::size_t pid)
    : context_(pid),
      assembly_service_(context_.api()),
      class_service_(context_.api()),
      field_enumeration_service_(context_.api()),
    field_value_reader_(context_.api()),
    field_value_writer_(context_.api(), context_.memory(), field_value_reader_),
    method_invocation_service_(context_.api(), context_.memory())
{
}

RuntimeClassOverlayResponse RuntimeInspector::InspectClass(const BridgeRequest& request) const
{
    const Address image = assembly_service_.ResolveImage(request.image_name);
    const Address klass = class_service_.ResolveClass(image, request.class_namespace, request.class_name);
    const auto hierarchy = class_service_.BuildClassHierarchy(klass);

    std::vector<FieldRecord> static_fields;
    std::vector<FieldRecord> instance_fields;
    for (const auto class_handle : hierarchy) {
        field_enumeration_service_.AppendClassFields(class_handle, static_fields, instance_fields);
    }

    RuntimeClassOverlayResponse response;
    response.static_fields.reserve(static_fields.size());
    response.fields.reserve(instance_fields.size());

    for (const auto& field : static_fields) {
        FieldRow row;
        row.name = field.name;
        row.field_type = field.type_name;
        row.address = field.static_address.has_value() ? std::optional<std::string>(shared::HexAddress(*field.static_address)) : std::nullopt;
        row.value = field_value_reader_.ReadFieldValue(field);
        response.static_fields.push_back(std::move(row));
    }

    for (const auto& field : instance_fields) {
        FieldRow row;
        row.name = field.name;
        row.field_type = field.type_name;
        row.offset = shared::HexOffset(field.offset);
        if (request.instance_address.has_value()) {
            row.address = shared::HexAddress(*request.instance_address + static_cast<Address>(field.offset));
            row.value = field_value_reader_.ReadFieldValue(field, request.instance_address);
        }
        response.fields.push_back(std::move(row));
    }

    return response;
}

RuntimeMethodInvokeResponse RuntimeInspector::InvokeClassMethod(const BridgeRequest& request) const
{
    const Address image = assembly_service_.ResolveImage(request.image_name);
    const Address klass = class_service_.ResolveClass(image, request.class_namespace, request.class_name);
    return method_invocation_service_.InvokeClassMethod(klass, request);
}

RuntimeFieldSetResponse RuntimeInspector::SetFieldValue(const BridgeRequest& request) const
{
    const Address image = assembly_service_.ResolveImage(request.image_name);
    const Address klass = class_service_.ResolveClass(image, request.class_namespace, request.class_name);
    const auto hierarchy = class_service_.BuildClassHierarchy(klass);

    std::vector<FieldRecord> static_fields;
    std::vector<FieldRecord> instance_fields;
    for (const auto class_handle : hierarchy) {
        field_enumeration_service_.AppendClassFields(class_handle, static_fields, instance_fields);
    }

    const auto& candidates = request.field_is_static ? static_fields : instance_fields;
    const auto match = std::find_if(candidates.begin(), candidates.end(), [&request](const FieldRecord& field) {
        if (field.name != request.field_name || field.type_name != request.field_type_name || field.is_static != request.field_is_static) {
            return false;
        }

        if (request.target_address.has_value()) {
            if (field.is_static) {
                return field.static_address.has_value() && *field.static_address == *request.target_address;
            }
            if (request.instance_address.has_value()) {
                return *request.instance_address + static_cast<Address>(field.offset) == *request.target_address;
            }
        }

        return true;
    });

    if (match == candidates.end()) {
        RuntimeFieldSetResponse response;
        response.failure_kind = RuntimeFieldSetFailureKind::FieldNotFound;
        response.field_name = request.field_name;
        response.field_type = request.field_type_name;
        response.is_static = request.field_is_static;
        response.error = "field not found";
        return response;
    }

    return field_value_writer_.SetFieldValue(*match, request);
}

} // namespace bridge::runtime