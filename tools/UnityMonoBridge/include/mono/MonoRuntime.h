#pragma once

#include <optional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "shared/Types.h"
#include "win32/Process.h"
#include "win32/Memory.h"

namespace bridge::win32 {
class RemoteCallInvoker;
}

namespace bridge::mono {

class MonoRuntime {
public:
    explicit MonoRuntime(std::size_t pid);
    ~MonoRuntime();

    MonoRuntime(const MonoRuntime&) = delete;
    MonoRuntime& operator=(const MonoRuntime&) = delete;

    Address Invoke(const std::string& function_name, const std::vector<Address>& arguments, bool attach_thread = true) const;
    Address InvokeDirect(Address function_address, const std::vector<Address>& arguments, bool attach_thread = true) const;
    std::string InvokeString(const std::string& function_name, const std::vector<Address>& arguments) const;
    int InvokeInt(const std::string& function_name, const std::vector<Address>& arguments) const;
    Address ExportAddress(const std::string& function_name) const;
    std::optional<Address> TryExportAddress(const std::string& function_name) const;
    Address root_domain() const;
    const win32::Process& process() const;
    const win32::Memory& memory() const;

private:
    void ResolveRequiredExport(const char* name);
    void ResolveOptionalExport(const char* name);
    Address ResolveExportAddress(const char* name) const;

    win32::Process process_;
    win32::Memory memory_;
    win32::ModuleInfo mono_module_;
    Address root_domain_ = 0;
    std::unordered_map<std::string, Address> exports_;
    std::unique_ptr<win32::RemoteCallInvoker> invoker_;
};

} // namespace bridge::mono