#pragma once

#include "runtime/api/RemoteRuntimeApiBase.h"

namespace bridge::runtime {

class Il2CppRuntimeApi : public RemoteRuntimeApiBase {
public:
    Il2CppRuntimeApi(const win32::Process& process, const win32::Memory& memory);

    RuntimeFlavor flavor() const override;
    std::vector<Address> EnumerateAssemblies() const override;
    Address GetAssemblyImage(Address assembly) const override;
    std::string GetImageName(Address image) const override;
    Address ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const override;
    Address GetParentClass(Address klass) const override;
    std::vector<FieldRecord> EnumerateFields(Address class_handle) const override;
    bool TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const override;
};

} // namespace bridge::runtime