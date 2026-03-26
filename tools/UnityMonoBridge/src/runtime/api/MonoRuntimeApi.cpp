#include "runtime/api/MonoRuntimeApi.h"

#include <Windows.h>

#include <array>
#include <sstream>
#include <stdexcept>

#include "shared/StringUtils.h"
#include "win32/RemoteMemory.h"

namespace bridge::runtime {

namespace {

constexpr int kFieldAttributeStatic = 0x0010;
constexpr int kFieldAttributeLiteral = 0x0040;
constexpr int kFieldAttributeHasFieldRva = 0x0100;
constexpr int kMethodAttributeStatic = 0x0010;
constexpr Address kManagedArrayDataOffset = 0x20;

bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty();
}

std::vector<std::string> SplitParameterTypes(std::string value)
{
    std::vector<std::string> parts;
    std::stringstream stream(std::move(value));
    std::string item;
    while (std::getline(stream, item, ',')) {
        const auto start = item.find_first_not_of(' ');
        if (start == std::string::npos) {
            continue;
        }

        const auto end = item.find_last_not_of(' ');
        parts.push_back(item.substr(start, end - start + 1));
    }

    return parts;
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
            "mono_class_get_methods",
            "mono_object_get_class",
            "mono_class_get_type",
            "mono_field_get_name",
            "mono_field_get_flags",
            "mono_field_get_type",
            "mono_type_get_name",
            "mono_field_get_offset",
            "mono_method_get_name",
            "mono_method_get_flags",
            "mono_method_signature",
            "mono_signature_get_desc",
            "mono_signature_get_param_count",
            "mono_method_get_param_names",
            "mono_signature_get_return_type",
            "mono_runtime_invoke",
            "mono_string_new",
            "mono_string_length",
            "mono_string_chars",
            "mono_array_length",
            "mono_object_unbox",
            "mono_object_to_string",
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

    constexpr std::size_t callback_offset = 0x100;
    constexpr std::size_t data_offset = 0x200;
    constexpr std::size_t block_size = data_offset + sizeof(AssemblyCollector);

    win32::RemoteAllocation block(memory(), block_size, PAGE_EXECUTE_READWRITE);
    const Address callback_address = block.address() + callback_offset;
    const Address data_address = block.address() + data_offset;

    AssemblyCollector collector{};
    memory().Write(callback_address, callback_code.data(), callback_code.size());
    memory().Write(data_address, collector);
    memory().Protect(block.address(), block_size, PAGE_EXECUTE_READWRITE);
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
        const bool is_literal = (flags & kFieldAttributeLiteral) != 0;
        const bool has_field_rva = (flags & kFieldAttributeHasFieldRva) != 0;
        const bool has_static_storage = (flags & kFieldAttributeStatic) != 0 && !is_literal && !has_field_rva;
        const bool is_static = has_static_storage || is_literal || has_field_rva;
        const Address type_handle = Invoke("mono_field_get_type", { field_handle });
        const auto type_name = InvokeString("mono_type_get_name", { type_handle });
        const int offset = InvokeInt("mono_field_get_offset", { field_handle });

        FieldRecord record;
        record.handle = field_handle;
        record.name = field_name;
        record.type_name = type_name;
        record.is_static = is_static;
        record.offset = offset;
        if (has_static_storage) {
            if (const auto address = ResolveStaticFieldAddress(class_handle, offset); address != 0) {
                record.static_address = address;
            }
        }

        fields.push_back(std::move(record));
    }

    return fields;
}

std::vector<MethodRecord> MonoRuntimeApi::EnumerateMethods(Address class_handle) const
{
    std::vector<MethodRecord> methods;
    win32::RemoteAllocation iterator(memory(), sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory().Write(iterator.address(), zero);

    while (true) {
        const Address method_handle = Invoke("mono_class_get_methods", { class_handle, iterator.address() });
        if (method_handle == 0) {
            break;
        }

        const auto method_name = memory().ReadUtf8(Invoke("mono_method_get_name", { method_handle }));
        if (method_name.empty()) {
            continue;
        }

        const int flags = InvokeInt("mono_method_get_flags", { method_handle, 0 });
        const Address signature_handle = Invoke("mono_method_signature", { method_handle });
        const auto parameter_desc = InvokeString("mono_signature_get_desc", { signature_handle, 1 });
        const auto parameter_types = SplitParameterTypes(parameter_desc);
        const int parameter_count = InvokeInt("mono_signature_get_param_count", { signature_handle });

        std::vector<Address> name_ptrs(static_cast<std::size_t>(parameter_count), 0);
        if (parameter_count > 0) {
            win32::RemoteAllocation names_block(memory(), name_ptrs.size() * sizeof(Address), PAGE_READWRITE);
            memory().Write(names_block.address(), name_ptrs.data(), name_ptrs.size() * sizeof(Address));
            Invoke("mono_method_get_param_names", { method_handle, names_block.address() });
            memory().Read(names_block.address(), name_ptrs.data(), name_ptrs.size() * sizeof(Address));
        }

        const Address return_type_handle = Invoke("mono_signature_get_return_type", { signature_handle });
        const auto return_type = InvokeString("mono_type_get_name", { return_type_handle });

        MethodRecord method;
        method.handle = method_handle;
        method.name = method_name;
        method.return_type = return_type;
        method.is_static = (flags & kMethodAttributeStatic) != 0;
        method.parameters.reserve(static_cast<std::size_t>(parameter_count));

        std::ostringstream signature;
        signature << return_type << " (";
        for (int index = 0; index < parameter_count; ++index) {
            if (index > 0) {
                signature << ", ";
            }

            const auto parameter_name = index < static_cast<int>(name_ptrs.size()) && name_ptrs[static_cast<std::size_t>(index)] != 0
                ? memory().ReadUtf8(name_ptrs[static_cast<std::size_t>(index)])
                : std::string();
            const auto parameter_type = index < static_cast<int>(parameter_types.size())
                ? parameter_types[static_cast<std::size_t>(index)]
                : std::string("System.Object");

            method.parameters.push_back(MethodParameterRecord {
                static_cast<std::size_t>(index),
                parameter_name,
                parameter_type,
            });

            signature << parameter_type;
            if (!parameter_name.empty()) {
                signature << ' ' << parameter_name;
            }
        }
        signature << ')';
        method.signature = signature.str();
        methods.push_back(std::move(method));
    }

    return methods;
}

Address MonoRuntimeApi::GetObjectClass(Address object_address) const
{
    return object_address == 0 ? 0 : Invoke("mono_object_get_class", { object_address });
}

std::string MonoRuntimeApi::GetClassTypeName(Address class_handle) const
{
    if (class_handle == 0) {
        return {};
    }

    const Address type_handle = Invoke("mono_class_get_type", { class_handle });
    return type_handle == 0 ? std::string() : InvokeString("mono_type_get_name", { type_handle });
}

std::size_t MonoRuntimeApi::GetArrayLength(Address array_object) const
{
    return array_object == 0 ? 0 : static_cast<std::size_t>(Invoke("mono_array_length", { array_object }));
}

Address MonoRuntimeApi::GetArrayElementAddress(Address array_object, std::size_t index) const
{
    if (array_object == 0 || index >= GetArrayLength(array_object)) {
        return 0;
    }

    return memory().Read<Address>(array_object + kManagedArrayDataOffset + index * sizeof(Address));
}

Address MonoRuntimeApi::UnboxObject(Address object_address) const
{
    return object_address == 0 ? 0 : Invoke("mono_object_unbox", { object_address });
}

bool MonoRuntimeApi::TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const
{
    if (!field.static_address.has_value()) {
        return false;
    }

    memory().Read(*field.static_address, buffer, size);
    return true;
}

bool MonoRuntimeApi::TryReadInstanceFieldBytes(Address instance_address, const FieldRecord& field, void* buffer, std::size_t size) const
{
    if (instance_address == 0 || field.is_static || field.offset < 0) {
        return false;
    }

    memory().Read(instance_address + static_cast<Address>(field.offset), buffer, size);
    return true;
}

Address MonoRuntimeApi::InvokeMethod(Address method_handle, Address instance_address, Address parameters_address, Address exception_address) const
{
    return Invoke("mono_runtime_invoke", { method_handle, instance_address, parameters_address, exception_address });
}

Address MonoRuntimeApi::CreateManagedString(const std::string& value) const
{
    win32::RemoteUtf8String remote_value(memory(), value);
    return Invoke("mono_string_new", { root_domain(), remote_value.address() });
}

std::optional<std::string> MonoRuntimeApi::ReadManagedString(Address string_object) const
{
    if (string_object == 0) {
        return std::nullopt;
    }

    const auto length = static_cast<std::size_t>(InvokeInt("mono_string_length", { string_object }));
    const Address chars = Invoke("mono_string_chars", { string_object });
    return shared::Utf16ToUtf8(memory().ReadUtf16(chars, length));
}

bool MonoRuntimeApi::TryReadUnboxedValue(Address object_address, void* buffer, std::size_t size) const
{
    if (object_address == 0) {
        return false;
    }

    const Address raw_value = UnboxObject(object_address);
    if (raw_value == 0) {
        return false;
    }

    memory().Read(raw_value, buffer, size);
    return true;
}

std::optional<std::string> MonoRuntimeApi::DescribeException(Address exception_object) const
{
    if (exception_object == 0) {
        return std::nullopt;
    }

    const Address string_object = Invoke("mono_object_to_string", { exception_object, 0 });
    return ReadManagedString(string_object);
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