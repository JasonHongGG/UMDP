#include "mono/FieldEnumerationService.h"

#include <Windows.h>

#include "mono/MonoRuntime.h"
#include "win32/Memory.h"
#include "win32/RemoteMemory.h"

namespace bridge::mono {

namespace {

constexpr int kFieldAttributeStatic = 0x0010;
constexpr int kFieldAttributeHasFieldRva = 0x0100;

bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty() || field_name.front() == '<';
}

} // namespace

FieldEnumerationService::FieldEnumerationService(const MonoRuntime& runtime)
    : runtime_(runtime)
{
}

void FieldEnumerationService::AppendClassFields(Address class_handle, std::vector<FieldRecord>& static_fields, std::vector<FieldRecord>& instance_fields) const
{
    win32::RemoteAllocation iterator(runtime_.memory(), sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    runtime_.memory().Write(iterator.address(), zero);

    while (true) {
        const Address field_handle = runtime_.Invoke("mono_class_get_fields", { class_handle, iterator.address() });
        if (field_handle == 0) {
            break;
        }

        const auto field_name = runtime_.memory().ReadUtf8(runtime_.Invoke("mono_field_get_name", { field_handle }));
        if (ShouldSkipField(field_name)) {
            continue;
        }

        const int flags = runtime_.InvokeInt("mono_field_get_flags", { field_handle });
        const bool is_static = (flags & (kFieldAttributeStatic | kFieldAttributeHasFieldRva)) != 0;
        const Address type_handle = runtime_.Invoke("mono_field_get_type", { field_handle });
        const auto type_name = runtime_.InvokeString("mono_type_get_name", { type_handle });
        const int offset = runtime_.InvokeInt("mono_field_get_offset", { field_handle });

        FieldRecord record{
            field_name,
            type_name,
            is_static,
            std::nullopt,
            offset,
        };

        if (is_static) {
            if (const auto address = ResolveStaticFieldAddress(class_handle, offset); address != 0) {
                record.static_address = address;
            }
            static_fields.push_back(std::move(record));
        }
        else {
            instance_fields.push_back(std::move(record));
        }
    }
}

Address FieldEnumerationService::ResolveStaticFieldAddress(Address class_handle, int field_offset) const
{
    const Address vtable = runtime_.Invoke("mono_class_vtable", { runtime_.root_domain(), class_handle });
    if (vtable == 0) {
        return 0;
    }

    const Address static_data = runtime_.Invoke("mono_vtable_get_static_field_data", { vtable });
    if (static_data == 0) {
        return 0;
    }

    return static_data + static_cast<Address>(field_offset);
}

} // namespace bridge::mono