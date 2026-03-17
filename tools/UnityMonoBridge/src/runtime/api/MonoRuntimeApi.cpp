#include "runtime/api/MonoRuntimeApi.h"

#include <Windows.h>

#include <array>
#include <stdexcept>

#include "shared/StringUtils.h"
#include "win32/RemoteMemory.h"

namespace bridge::runtime {

namespace {

constexpr int kFieldAttributeStatic = 0x0010;
constexpr int kFieldAttributeHasFieldRva = 0x0100;

bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty() || field_name.front() == '<';
}

} // namespace

MonoRuntimeApi::MonoRuntimeApi(const win32::Process& process, const win32::Memory& memory)
    : RemoteRuntimeApiBase(process, memory, { L"mono.dll", L"mono-2.0-bdwgc.dll", L"mono-2.0-sgen.dll" }, "mono")
{
    Initialize(
        "mono_get_root_domain",
        "mono_thread_attach",
        "mono_thread_detach",
        {
            "mono_assembly_foreach",
            "mono_assembly_get_image",
            "mono_image_get_name",
            "mono_class_from_name",
            "mono_class_get_parent",
            "mono_class_vtable",
            "mono_vtable_get_static_field_data",
            "mono_class_get_fields",
            "mono_field_get_name",
            "mono_field_get_flags",
            "mono_field_get_type",
            "mono_type_get_name",
            "mono_field_get_offset",
        },
        { "mono_class_from_name_case" });
}

RuntimeFlavor MonoRuntimeApi::flavor() const
{
    return RuntimeFlavor::Mono;
}

std::vector<Address> MonoRuntimeApi::EnumerateAssemblies() const
{
    struct AssemblyCollector {
        std::uint32_t count = 0;
        std::uint32_t reserved = 0;
        Address handles[510]{};
    };

    static constexpr std::array<std::uint8_t, 17> callback_code = {
        0x8B, 0x02, 0x3D, 0xFE, 0x01, 0x00, 0x00, 0x77, 0x07,
        0x48, 0x89, 0x4C, 0xC2, 0x08, 0xFF, 0x02, 0xC3,
    };

    win32::RemoteAllocation block(memory(), 4096, PAGE_EXECUTE_READWRITE);
    const Address callback_address = block.address() + 0x100;
    const Address data_address = block.address() + 0x200;

    AssemblyCollector collector{};
    memory().Write(callback_address, callback_code.data(), callback_code.size());
    memory().Write(data_address, collector);
    memory().Protect(block.address(), 4096, PAGE_EXECUTE_READWRITE);
    Invoke("mono_assembly_foreach", { callback_address, data_address });
    collector = memory().Read<AssemblyCollector>(data_address);

    const auto count = (std::min<std::size_t>)(collector.count, std::size(collector.handles));
    return std::vector<Address>(collector.handles, collector.handles + count);
}

Address MonoRuntimeApi::GetAssemblyImage(Address assembly) const
{
    return Invoke("mono_assembly_get_image", { assembly });
}

std::string MonoRuntimeApi::GetImageName(Address image) const
{
    return InvokeString("mono_image_get_name", { image });
}

Address MonoRuntimeApi::ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const
{
    const auto [normalized_namespace, normalized_name] = shared::NormalizeClassName(class_namespace, class_name);
    win32::RemoteUtf8String namespace_arg(memory(), normalized_namespace);
    win32::RemoteUtf8String class_arg(memory(), normalized_name);

    if (const auto found = TryExportAddress("mono_class_from_name_case"); found.has_value()) {
        if (const auto klass = InvokeDirect(*found, { image, namespace_arg.address(), class_arg.address() }); klass != 0) {
            return klass;
        }
    }

    if (const auto klass = Invoke("mono_class_from_name", { image, namespace_arg.address(), class_arg.address() }); klass != 0) {
        return klass;
    }

    throw std::runtime_error("class not found");
}

Address MonoRuntimeApi::GetParentClass(Address klass) const
{
    return Invoke("mono_class_get_parent", { klass });
}

std::vector<FieldRecord> MonoRuntimeApi::EnumerateFields(Address class_handle) const
{
    std::vector<FieldRecord> fields;
    win32::RemoteAllocation iterator(memory(), sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory().Write(iterator.address(), zero);

    while (true) {
        const Address field_handle = Invoke("mono_class_get_fields", { class_handle, iterator.address() });
        if (field_handle == 0) {
            break;
        }

        const auto field_name = memory().ReadUtf8(Invoke("mono_field_get_name", { field_handle }));
        if (ShouldSkipField(field_name)) {
            continue;
        }

        const int flags = InvokeInt("mono_field_get_flags", { field_handle });
        const bool is_static = (flags & (kFieldAttributeStatic | kFieldAttributeHasFieldRva)) != 0;
        const Address type_handle = Invoke("mono_field_get_type", { field_handle });
        const auto type_name = InvokeString("mono_type_get_name", { type_handle });
        const int offset = InvokeInt("mono_field_get_offset", { field_handle });

        FieldRecord record;
        record.handle = field_handle;
        record.name = field_name;
        record.type_name = type_name;
        record.is_static = is_static;
        record.offset = offset;
        if (is_static) {
            if (const auto address = ResolveStaticFieldAddress(class_handle, offset); address != 0) {
                record.static_address = address;
            }
        }

        fields.push_back(std::move(record));
    }

    return fields;
}

bool MonoRuntimeApi::TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const
{
    if (!field.static_address.has_value()) {
        return false;
    }

    memory().Read(*field.static_address, buffer, size);
    return true;
}

Address MonoRuntimeApi::ResolveStaticFieldAddress(Address class_handle, int field_offset) const
{
    const Address vtable = Invoke("mono_class_vtable", { root_domain(), class_handle });
    if (vtable == 0) {
        return 0;
    }

    const Address static_data = Invoke("mono_vtable_get_static_field_data", { vtable });
    if (static_data == 0) {
        return 0;
    }

    return static_data + static_cast<Address>(field_offset);
}

} // namespace bridge::runtime