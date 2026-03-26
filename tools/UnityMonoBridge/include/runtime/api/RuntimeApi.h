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

struct MethodParameterRecord {
    std::size_t position = 0;
    std::string name;
    std::string type_name;
};

struct MethodRecord {
    Address handle = 0;
    std::string name;
    std::string signature;
    std::string return_type;
    bool is_static = false;
    std::vector<MethodParameterRecord> parameters;
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
    virtual std::vector<MethodRecord> EnumerateMethods(Address class_handle) const = 0;
    virtual Address GetObjectClass(Address object_address) const = 0;
    virtual std::string GetClassTypeName(Address class_handle) const = 0;
    virtual std::size_t GetArrayLength(Address array_object) const = 0;
    virtual Address GetArrayElementAddress(Address array_object, std::size_t index) const = 0;
    virtual bool TryReadStaticFieldBytes(const FieldRecord& field, void* buffer, std::size_t size) const = 0;
    virtual bool TryReadInstanceFieldBytes(Address instance_address, const FieldRecord& field, void* buffer, std::size_t size) const = 0;
    virtual Address InvokeMethod(Address method_handle, Address instance_address, Address parameters_address, Address exception_address) const = 0;
    virtual Address CreateManagedString(const std::string& value) const = 0;
    virtual std::optional<std::string> ReadManagedString(Address string_object) const = 0;
    virtual bool TryReadUnboxedValue(Address object_address, void* buffer, std::size_t size) const = 0;
    virtual std::optional<std::string> DescribeException(Address exception_object) const = 0;
};

} // namespace bridge::runtime