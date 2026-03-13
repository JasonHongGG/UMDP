#include "runtime/services/FieldEnumerationService.h"

namespace bridge::runtime {

FieldEnumerationService::FieldEnumerationService(const RuntimeApi& api)
    : api_(api)
{
}

void FieldEnumerationService::AppendClassFields(Address class_handle, std::vector<FieldRecord>& static_fields, std::vector<FieldRecord>& instance_fields) const
{
    for (auto field : api_.EnumerateFields(class_handle)) {
        if (field.is_static) {
            static_fields.push_back(std::move(field));
        }
        else {
            instance_fields.push_back(std::move(field));
        }
    }
}

} // namespace bridge::runtime