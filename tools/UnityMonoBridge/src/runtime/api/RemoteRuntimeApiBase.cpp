#include "runtime/api/RemoteRuntimeApiBase.h"

#include <Windows.h>

#include <stdexcept>

#include "win32/RemoteCall.h"

namespace bridge::runtime {

RemoteRuntimeApiBase::RemoteRuntimeApiBase(
    const win32::Process& process,
    const win32::Memory& memory,
    const std::vector<std::wstring>& module_candidates,
    std::string runtime_label)
    : process_(process), memory_(memory), runtime_label_(std::move(runtime_label))
{
    const auto module = process_.FindModule(module_candidates);
    if (!module.has_value()) {
        throw std::runtime_error(runtime_label_ + " runtime module not found");
    }

    runtime_module_ = *module;
}

RemoteRuntimeApiBase::~RemoteRuntimeApiBase() = default;

void RemoteRuntimeApiBase::Initialize(
    const char* root_domain_export,
    const char* thread_attach_export,
    const char* thread_detach_export,
    const std::vector<const char*>& required_exports,
    const std::vector<const char*>& optional_exports)
{
    ResolveRequiredExport(root_domain_export);
    ResolveRequiredExport(thread_attach_export);
    ResolveRequiredExport(thread_detach_export);

    for (const auto* export_name : required_exports) {
        ResolveRequiredExport(export_name);
    }

    for (const auto* export_name : optional_exports) {
        ResolveOptionalExport(export_name);
    }

    root_domain_ = InvokeDirect(exports_.at(root_domain_export), {}, false);
    if (root_domain_ == 0) {
        throw std::runtime_error("failed to resolve " + runtime_label_ + " root domain");
    }

    invoker_ = std::make_unique<win32::RemoteCallInvoker>(
        memory_,
        root_domain_,
        exports_.at(thread_attach_export),
        exports_.at(thread_detach_export));
}

Address RemoteRuntimeApiBase::Invoke(const std::string& function_name, const std::vector<Address>& arguments, bool attach_thread) const
{
    return InvokeDirect(ExportAddress(function_name), arguments, attach_thread);
}

Address RemoteRuntimeApiBase::InvokeDirect(Address function_address, const std::vector<Address>& arguments, bool attach_thread) const
{
    return invoker_ != nullptr
        ? invoker_->Invoke(function_address, arguments, attach_thread)
        : win32::RemoteCallInvoker(memory_, root_domain_, 0, 0).Invoke(function_address, arguments, false);
}

std::string RemoteRuntimeApiBase::InvokeString(const std::string& function_name, const std::vector<Address>& arguments) const
{
    return memory_.ReadUtf8(Invoke(function_name, arguments));
}

int RemoteRuntimeApiBase::InvokeInt(const std::string& function_name, const std::vector<Address>& arguments) const
{
    return static_cast<int>(Invoke(function_name, arguments));
}

Address RemoteRuntimeApiBase::ExportAddress(const std::string& function_name) const
{
    return exports_.at(function_name);
}

std::optional<Address> RemoteRuntimeApiBase::TryExportAddress(const std::string& function_name) const
{
    if (const auto found = exports_.find(function_name); found != exports_.end()) {
        return found->second;
    }

    return std::nullopt;
}

Address RemoteRuntimeApiBase::root_domain() const
{
    return root_domain_;
}

const win32::Memory& RemoteRuntimeApiBase::memory() const
{
    return memory_;
}

void RemoteRuntimeApiBase::ResolveRequiredExport(const char* name)
{
    const auto address = ResolveExportAddress(name);
    if (address == 0) {
        throw std::runtime_error("required " + runtime_label_ + " export not found: " + std::string(name));
    }

    exports_.emplace(name, address);
}

void RemoteRuntimeApiBase::ResolveOptionalExport(const char* name)
{
    if (const auto address = ResolveExportAddress(name); address != 0) {
        exports_.emplace(name, address);
    }
}

Address RemoteRuntimeApiBase::ResolveExportAddress(const char* name) const
{
    HMODULE local_module = LoadLibraryExW(runtime_module_.path.c_str(), nullptr, DONT_RESOLVE_DLL_REFERENCES);
    if (local_module == nullptr) {
        throw std::runtime_error("failed to load local copy of runtime module for export resolution");
    }

    const auto local_proc = reinterpret_cast<Address>(GetProcAddress(local_module, name));
    const auto local_base = reinterpret_cast<Address>(local_module);
    const Address remote_proc = local_proc == 0 ? 0 : runtime_module_.base + (local_proc - local_base);
    FreeLibrary(local_module);
    return remote_proc;
}

} // namespace bridge::runtime