#include "runtime/services/RuntimeInspector.h"

#include "shared/Formatting.h"

namespace bridge::runtime {

RuntimeInspector::RuntimeInspector(std::size_t pid)
    : context_(pid),
      assembly_service_(context_.api()),
      class_service_(context_.api()),
      field_enumeration_service_(context_.api()),
      static_value_reader_(context_.api())
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
        row.value = static_value_reader_.ReadStaticValue(field);
        response.static_fields.push_back(std::move(row));
    }

    for (const auto& field : instance_fields) {
        FieldRow row;
        row.name = field.name;
        row.field_type = field.type_name;
        row.offset = shared::HexOffset(field.offset);
        response.fields.push_back(std::move(row));
    }

    return response;
}

} // namespace bridge::runtime