#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "runtime/api/RuntimeApi.h"
#include "win32/Memory.h"
#include "win32/Process.h"

namespace bridge::win32 {
class RemoteCallInvoker;
}

namespace bridge::runtime {

class RemoteRuntimeApiBase : public RuntimeApi {
protected:
    RemoteRuntimeApiBase(
        const win32::Process& process,
        const win32::Memory& memory,
        const std::vector<std::wstring>& module_candidates,
        std::string runtime_label);
    ~RemoteRuntimeApiBase() override;

    void Initialize(
        const char* root_domain_export,
        const char* thread_attach_export,
        const char* thread_detach_export,
        const std::vector<const char*>& required_exports,
        const std::vector<const char*>& optional_exports = {});

    Address Invoke(const std::string& function_name, const std::vector<Address>& arguments, bool attach_thread = true) const;
    Address InvokeDirect(Address function_address, const std::vector<Address>& arguments, bool attach_thread = true) const;
    std::string InvokeString(const std::string& function_name, const std::vector<Address>& arguments) const;
    int InvokeInt(const std::string& function_name, const std::vector<Address>& arguments) const;
    Address ExportAddress(const std::string& function_name) const;
    std::optional<Address> TryExportAddress(const std::string& function_name) const;
    Address root_domain() const;
    const win32::Memory& memory() const;

private:
    void ResolveRequiredExport(const char* name);
    void ResolveOptionalExport(const char* name);
    Address ResolveExportAddress(const char* name) const;

    const win32::Process& process_;
    const win32::Memory& memory_;
    std::string runtime_label_;
    win32::ModuleInfo runtime_module_;
    Address root_domain_ = 0;
    std::unordered_map<std::string, Address> exports_;
    std::unique_ptr<win32::RemoteCallInvoker> invoker_;
};

} // namespace bridge::runtime