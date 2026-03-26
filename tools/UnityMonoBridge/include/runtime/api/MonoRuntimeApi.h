#pragma once

#include "runtime/api/RemoteRuntimeApiBase.h"

namespace bridge::runtime {

class MonoRuntimeApi : public RemoteRuntimeApiBase {
public:
    MonoRuntimeApi(const win32::Process& process, const win32::Memory& memory);

    RuntimeFlavor flavor() const override;
    std::vector<Address> EnumerateAssemblies() const override;
    Address GetAssemblyImage(Address assembly) const override;
    std::string GetImageName(Address image) const override;
    Address ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const override;
    Address GetParentClass(Address klass) const override;
    std::vector<FieldRecord> EnumerateFields(Address class_handle) const override;
    std::vector<MethodRecord> EnumerateMethods(Address class_handle) const override;
    Address GetObjectClass(Address object_address) const override;
    std::string GetClassTypeName(Address class_handle) const override;
    std::size_t GetArrayLength(Address array_object) const override;
    Address GetArrayElementAddress(Address array_object, std::size_t index) const override;
    bool TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const override;
    bool TryReadInstanceFieldBytes(Address instance_address, const FieldRecord& field, void* buffer, std::size_t size) const override;
    Address InvokeMethod(Address method_handle, Address instance_address, Address parameters_address, Address exception_address) const override;
    Address CreateManagedString(const std::string& value) const override;
    std::optional<std::string> ReadManagedString(Address string_object) const override;
    bool TryReadUnboxedValue(Address object_address, void* buffer, std::size_t size) const override;
    std::optional<std::string> DescribeException(Address exception_object) const override;

private:
    Address ResolveStaticFieldAddress(Address class_handle, int field_offset) const;
};

} // namespace bridge::runtime