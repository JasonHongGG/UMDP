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
    bool TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const override;

private:
    Address ResolveStaticFieldAddress(Address class_handle, int field_offset) const;
};

} // namespace bridge::runtime