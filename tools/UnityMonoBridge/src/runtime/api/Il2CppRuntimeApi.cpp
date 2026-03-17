#include "runtime/api/Il2CppRuntimeApi.h"

#include <Windows.h>

#include <stdexcept>

#include "shared/StringUtils.h"
#include "win32/RemoteMemory.h"

namespace bridge::runtime {

namespace {

constexpr int kFieldAttributeStatic = 0x0010;
constexpr int kFieldAttributeLiteral = 0x0040;
constexpr int kFieldAttributeHasFieldRva = 0x0100;

bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty() || field_name.front() == '<';
}

} // namespace

Il2CppRuntimeApi::Il2CppRuntimeApi(const win32::Process& process, const win32::Memory& memory)
    : RemoteRuntimeApiBase(process, memory, { L"GameAssembly.dll" }, "il2cpp")
{
    Initialize(
        "il2cpp_domain_get",
        "il2cpp_thread_attach",
        "il2cpp_thread_detach",
        {
            "il2cpp_domain_get_assemblies",
            "il2cpp_assembly_get_image",
            "il2cpp_image_get_name",
            "il2cpp_class_from_name",
            "il2cpp_class_get_parent",
            "il2cpp_class_get_fields",
            "il2cpp_field_get_name",
            "il2cpp_field_get_flags",
            "il2cpp_field_get_type",
            "il2cpp_type_get_name",
            "il2cpp_field_get_offset",
            "il2cpp_field_static_get_value",
        });
}

RuntimeFlavor Il2CppRuntimeApi::flavor() const
{
    return RuntimeFlavor::Il2Cpp;
}

std::vector<Address> Il2CppRuntimeApi::EnumerateAssemblies() const
{
    win32::RemoteAllocation count_block(memory(), sizeof(std::uint64_t), PAGE_READWRITE);
    const std::uint64_t zero = 0;
    memory().Write(count_block.address(), zero);

    const Address assemblies_address = Invoke("il2cpp_domain_get_assemblies", { root_domain(), count_block.address() });
    if (assemblies_address == 0) {
        return {};
    }

    const auto count = memory().Read<std::uint64_t>(count_block.address());
    std::vector<Address> assemblies(static_cast<std::size_t>(count));
    if (!assemblies.empty()) {
        memory().Read(assemblies_address, assemblies.data(), assemblies.size() * sizeof(Address));
    }

    return assemblies;
}

Address Il2CppRuntimeApi::GetAssemblyImage(Address assembly) const
{
    return Invoke("il2cpp_assembly_get_image", { assembly });
}

std::string Il2CppRuntimeApi::GetImageName(Address image) const
{
    return InvokeString("il2cpp_image_get_name", { image });
}

Address Il2CppRuntimeApi::ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const
{
    const auto [normalized_namespace, normalized_name] = shared::NormalizeClassName(class_namespace, class_name);
    win32::RemoteUtf8String namespace_arg(memory(), normalized_namespace);
    win32::RemoteUtf8String class_arg(memory(), normalized_name);

    if (const auto klass = Invoke("il2cpp_class_from_name", { image, namespace_arg.address(), class_arg.address() }); klass != 0) {
        return klass;
    }

    throw std::runtime_error("class not found");
}

Address Il2CppRuntimeApi::GetParentClass(Address klass) const
{
    return Invoke("il2cpp_class_get_parent", { klass });
}

std::vector<FieldRecord> Il2CppRuntimeApi::EnumerateFields(Address class_handle) const
{
    std::vector<FieldRecord> fields;
    win32::RemoteAllocation iterator(memory(), sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory().Write(iterator.address(), zero);

    while (true) {
        const Address field_handle = Invoke("il2cpp_class_get_fields", { class_handle, iterator.address() });
        if (field_handle == 0) {
            break;
        }

        const auto field_name = memory().ReadUtf8(Invoke("il2cpp_field_get_name", { field_handle }));
        if (ShouldSkipField(field_name)) {
            continue;
        }

        const int flags = InvokeInt("il2cpp_field_get_flags", { field_handle });
        const bool is_literal = (flags & kFieldAttributeLiteral) != 0;
        const bool has_field_rva = (flags & kFieldAttributeHasFieldRva) != 0;
        const bool has_static_storage = (flags & kFieldAttributeStatic) != 0 && !is_literal && !has_field_rva;
        const bool is_static = has_static_storage || is_literal || has_field_rva;
        const Address type_handle = Invoke("il2cpp_field_get_type", { field_handle });
        const auto type_name = InvokeString("il2cpp_type_get_name", { type_handle });
        const int offset = InvokeInt("il2cpp_field_get_offset", { field_handle });

        FieldRecord record;
        record.handle = field_handle;
        record.name = field_name;
        record.type_name = type_name;
        record.is_static = is_static;
        record.offset = offset;
        fields.push_back(std::move(record));
    }

    return fields;
}

bool Il2CppRuntimeApi::TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const
{
    if (field.handle == 0) {
        return false;
    }

    win32::RemoteAllocation scratch(memory(), size, PAGE_READWRITE);
    std::vector<std::uint8_t> zeroes(size, 0);
    memory().Write(scratch.address(), zeroes.data(), zeroes.size());
    Invoke("il2cpp_field_static_get_value", { field.handle, scratch.address() });
    memory().Read(scratch.address(), buffer, size);
    return true;
}

} // namespace bridge::runtime