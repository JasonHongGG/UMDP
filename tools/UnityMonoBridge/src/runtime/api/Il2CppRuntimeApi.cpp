#include "runtime/api/Il2CppRuntimeApi.h"

#include <Windows.h>

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
    return field_name.empty() || field_name.front() == '<';
}

bool ShouldSkipMethod(const std::string& method_name)
{
    return method_name.empty();
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
            "il2cpp_class_get_methods",
            "il2cpp_object_get_class",
            "il2cpp_class_get_type",
            "il2cpp_field_get_name",
            "il2cpp_field_get_flags",
            "il2cpp_field_get_type",
            "il2cpp_type_get_name",
            "il2cpp_field_get_offset",
            "il2cpp_field_static_get_value",
            "il2cpp_method_get_name",
            "il2cpp_method_get_flags",
            "il2cpp_method_get_param_count",
            "il2cpp_method_get_param_name",
            "il2cpp_method_get_param",
            "il2cpp_method_get_return_type",
            "il2cpp_runtime_invoke",
            "il2cpp_string_new",
            "il2cpp_string_length",
            "il2cpp_string_chars",
            "il2cpp_array_length",
            "il2cpp_object_unbox",
            "il2cpp_object_to_string",
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

std::vector<MethodRecord> Il2CppRuntimeApi::EnumerateMethods(Address class_handle) const
{
    std::vector<MethodRecord> methods;
    win32::RemoteAllocation iterator(memory(), sizeof(Address), PAGE_READWRITE);
    const Address zero = 0;
    memory().Write(iterator.address(), zero);

    while (true) {
        const Address method_handle = Invoke("il2cpp_class_get_methods", { class_handle, iterator.address() });
        if (method_handle == 0) {
            break;
        }

        const auto method_name = memory().ReadUtf8(Invoke("il2cpp_method_get_name", { method_handle }));
        if (ShouldSkipMethod(method_name)) {
            continue;
        }

        const int flags = InvokeInt("il2cpp_method_get_flags", { method_handle, 0 });
        const int parameter_count = InvokeInt("il2cpp_method_get_param_count", { method_handle });
        const Address return_type_handle = Invoke("il2cpp_method_get_return_type", { method_handle });
        const auto return_type = InvokeString("il2cpp_type_get_name", { return_type_handle });

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

            const auto parameter_name = memory().ReadUtf8(Invoke("il2cpp_method_get_param_name", { method_handle, static_cast<Address>(index) }));
            const Address parameter_type_handle = Invoke("il2cpp_method_get_param", { method_handle, static_cast<Address>(index) });
            const auto parameter_type = InvokeString("il2cpp_type_get_name", { parameter_type_handle });

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

Address Il2CppRuntimeApi::GetObjectClass(Address object_address) const
{
    return object_address == 0 ? 0 : Invoke("il2cpp_object_get_class", { object_address });
}

std::string Il2CppRuntimeApi::GetClassTypeName(Address class_handle) const
{
    if (class_handle == 0) {
        return {};
    }

    const Address type_handle = Invoke("il2cpp_class_get_type", { class_handle });
    return type_handle == 0 ? std::string() : InvokeString("il2cpp_type_get_name", { type_handle });
}

std::size_t Il2CppRuntimeApi::GetArrayLength(Address array_object) const
{
    return array_object == 0 ? 0 : static_cast<std::size_t>(Invoke("il2cpp_array_length", { array_object }));
}

Address Il2CppRuntimeApi::GetArrayElementAddress(Address array_object, std::size_t index) const
{
    if (array_object == 0 || index >= GetArrayLength(array_object)) {
        return 0;
    }

    return memory().Read<Address>(array_object + kManagedArrayDataOffset + index * sizeof(Address));
}

Address Il2CppRuntimeApi::UnboxObject(Address object_address) const
{
    return object_address == 0 ? 0 : Invoke("il2cpp_object_unbox", { object_address });
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

bool Il2CppRuntimeApi::TryReadInstanceFieldBytes(Address instance_address, const FieldRecord& field, void* buffer, std::size_t size) const
{
    if (instance_address == 0 || field.is_static || field.offset < 0) {
        return false;
    }

    memory().Read(instance_address + static_cast<Address>(field.offset), buffer, size);
    return true;
}

Address Il2CppRuntimeApi::InvokeMethod(Address method_handle, Address instance_address, Address parameters_address, Address exception_address) const
{
    return Invoke("il2cpp_runtime_invoke", { method_handle, instance_address, parameters_address, exception_address });
}

Address Il2CppRuntimeApi::CreateManagedString(const std::string& value) const
{
    win32::RemoteUtf8String remote_value(memory(), value);
    return Invoke("il2cpp_string_new", { remote_value.address() });
}

std::optional<std::string> Il2CppRuntimeApi::ReadManagedString(Address string_object) const
{
    if (string_object == 0) {
        return std::nullopt;
    }

    const auto length = static_cast<std::size_t>(InvokeInt("il2cpp_string_length", { string_object }));
    const Address chars = Invoke("il2cpp_string_chars", { string_object });
    return shared::Utf16ToUtf8(memory().ReadUtf16(chars, length));
}

bool Il2CppRuntimeApi::TryReadUnboxedValue(Address object_address, void* buffer, std::size_t size) const
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

std::optional<std::string> Il2CppRuntimeApi::DescribeException(Address exception_object) const
{
    if (exception_object == 0) {
        return std::nullopt;
    }

    const Address string_object = Invoke("il2cpp_object_to_string", { exception_object, 0 });
    return ReadManagedString(string_object);
}

} // namespace bridge::runtime