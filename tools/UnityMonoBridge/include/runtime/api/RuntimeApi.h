#pragma once

#include <cstddef>
#include <optional>
#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge::runtime {

enum class RuntimeFlavor {
    Mono,
    Il2Cpp,
};

struct FieldRecord {
    Address handle = 0;
    std::string name;
    std::string type_name;
    bool is_static = false;
    std::optional<Address> static_address;
    int offset = 0;
};

class RuntimeApi {
public:
    virtual ~RuntimeApi() = default;

    virtual RuntimeFlavor flavor() const = 0;
    virtual std::vector<Address> EnumerateAssemblies() const = 0;
    virtual Address GetAssemblyImage(Address assembly) const = 0;
    virtual std::string GetImageName(Address image) const = 0;
    virtual Address ResolveClass(Address image, const std::string& class_namespace, const std::string& class_name) const = 0;
    virtual Address GetParentClass(Address klass) const = 0;
    virtual std::vector<FieldRecord> EnumerateFields(Address class_handle) const = 0;
    virtual bool TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const = 0;
};

} // namespace bridge::runtime