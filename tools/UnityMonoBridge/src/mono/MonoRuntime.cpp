#include "mono/MonoRuntime.h"

#include <Windows.h>

#include <memory>
#include <stdexcept>
#include <string>

#include "win32/RemoteCall.h"

namespace bridge::mono {

MonoRuntime::MonoRuntime(std::size_t pid)
    : process_(pid), memory_(process_)
{
    const auto mono_module = process_.FindModule({ L"mono.dll", L"mono-2.0-bdwgc.dll", L"mono-2.0-sgen.dll" });
    if (!mono_module.has_value()) {
        if (process_.FindModule({ L"GameAssembly.dll" }).has_value()) {
            throw std::runtime_error("IL2CPP runtime is not supported by this bridge yet");
        }

        throw std::runtime_error("mono runtime module not found");
    }

    mono_module_ = *mono_module;
    ResolveRequiredExport("mono_get_root_domain");
    ResolveRequiredExport("mono_thread_attach");
    ResolveRequiredExport("mono_thread_detach");
    ResolveRequiredExport("mono_assembly_foreach");
    ResolveRequiredExport("mono_assembly_get_image");
    ResolveRequiredExport("mono_image_get_name");
    ResolveOptionalExport("mono_class_from_name_case");
    ResolveRequiredExport("mono_class_from_name");
    ResolveRequiredExport("mono_class_get_parent");
    ResolveRequiredExport("mono_class_vtable");
    ResolveRequiredExport("mono_vtable_get_static_field_data");
    ResolveRequiredExport("mono_class_get_fields");
    ResolveRequiredExport("mono_field_get_name");
    ResolveRequiredExport("mono_field_get_flags");
    ResolveRequiredExport("mono_field_get_type");
    ResolveRequiredExport("mono_type_get_name");
    ResolveRequiredExport("mono_field_get_offset");

    root_domain_ = InvokeDirect(exports_.at("mono_get_root_domain"), {}, false);
    if (root_domain_ == 0) {
        throw std::runtime_error("failed to resolve Mono root domain");
    }

    invoker_ = std::make_unique<win32::RemoteCallInvoker>(
        memory_,
        root_domain_,
        exports_.at("mono_thread_attach"),
        exports_.at("mono_thread_detach"));
}

MonoRuntime::~MonoRuntime() = default;

Address MonoRuntime::Invoke(const std::string& function_name, const std::vector<Address>& arguments, bool attach_thread) const
{
    return InvokeDirect(ExportAddress(function_name), arguments, attach_thread);
}

Address MonoRuntime::InvokeDirect(Address function_address, const std::vector<Address>& arguments, bool attach_thread) const
{
    return invoker_ != nullptr
        ? invoker_->Invoke(function_address, arguments, attach_thread)
        : win32::RemoteCallInvoker(memory_, root_domain_, 0, 0).Invoke(function_address, arguments, false);
}

std::string MonoRuntime::InvokeString(const std::string& function_name, const std::vector<Address>& arguments) const
{
    return memory_.ReadUtf8(Invoke(function_name, arguments));
}

int MonoRuntime::InvokeInt(const std::string& function_name, const std::vector<Address>& arguments) const
{
    return static_cast<int>(Invoke(function_name, arguments));
}

Address MonoRuntime::ExportAddress(const std::string& function_name) const
{
    return exports_.at(function_name);
}

std::optional<Address> MonoRuntime::TryExportAddress(const std::string& function_name) const
{
    if (const auto found = exports_.find(function_name); found != exports_.end()) {
        return found->second;
    }

    return std::nullopt;
}

Address MonoRuntime::root_domain() const
{
    return root_domain_;
}

const win32::Process& MonoRuntime::process() const
{
    return process_;
}

const win32::Memory& MonoRuntime::memory() const
{
    return memory_;
}

void MonoRuntime::ResolveRequiredExport(const char* name)
{
    const auto address = ResolveExportAddress(name);
    if (address == 0) {
        throw std::runtime_error(std::string("required mono export not found: ") + name);
    }

    exports_.emplace(name, address);
}

void MonoRuntime::ResolveOptionalExport(const char* name)
{
    if (const auto address = ResolveExportAddress(name); address != 0) {
        exports_.emplace(name, address);
    }
}

Address MonoRuntime::ResolveExportAddress(const char* name) const
{
    HMODULE local_module = LoadLibraryExW(mono_module_.path.c_str(), nullptr, DONT_RESOLVE_DLL_REFERENCES);
    if (local_module == nullptr) {
        throw std::runtime_error("failed to load local copy of mono runtime for export resolution");
    }

    const auto local_proc = reinterpret_cast<Address>(GetProcAddress(local_module, name));
    const auto local_base = reinterpret_cast<Address>(local_module);
    const Address remote_proc = local_proc == 0 ? 0 : mono_module_.base + (local_proc - local_base);
    FreeLibrary(local_module);
    return remote_proc;
}

} // namespace bridge::mono