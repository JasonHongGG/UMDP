#include "win32/Process.h"

#include <TlHelp32.h>

#include <stdexcept>

#include "shared/StringUtils.h"

namespace bridge::win32 {

Process::Process(std::size_t pid)
    : pid_(static_cast<DWORD>(pid))
{
    handle_ = OpenProcess(
        PROCESS_CREATE_THREAD
            | PROCESS_QUERY_INFORMATION
            | PROCESS_VM_OPERATION
            | PROCESS_VM_READ
            | PROCESS_VM_WRITE,
        FALSE,
        pid_);
    if (handle_ == nullptr) {
        throw std::runtime_error("failed to open target process");
    }

    if (!Is64BitProcess()) {
        throw std::runtime_error("UnityMonoBridge currently supports x64 target processes only");
    }
}

Process::~Process()
{
    if (handle_ != nullptr) {
        CloseHandle(handle_);
    }
}

HANDLE Process::handle() const
{
    return handle_;
}

std::vector<ModuleInfo> Process::EnumerateModules() const
{
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid_);
    if (snapshot == INVALID_HANDLE_VALUE) {
        throw std::runtime_error("failed to enumerate process modules");
    }

    MODULEENTRY32W entry{};
    entry.dwSize = sizeof(entry);

    std::vector<ModuleInfo> modules;
    if (Module32FirstW(snapshot, &entry)) {
        do {
            modules.push_back(ModuleInfo{
                entry.szModule,
                entry.szExePath,
                reinterpret_cast<Address>(entry.modBaseAddr),
            });
        } while (Module32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
    return modules;
}

std::optional<ModuleInfo> Process::FindModule(const std::vector<std::wstring>& candidates) const
{
    const auto modules = EnumerateModules();
    for (const auto& module : modules) {
        const auto module_name = shared::ToLowerAscii(module.name);
        for (const auto& candidate : candidates) {
            if (module_name == shared::ToLowerAscii(candidate)) {
                return module;
            }
        }
    }

    return std::nullopt;
}

bool Process::Is64BitProcess() const
{
    BOOL wow64 = FALSE;
    if (!IsWow64Process(handle_, &wow64)) {
        throw std::runtime_error("failed to determine process architecture");
    }

    SYSTEM_INFO system_info{};
    GetNativeSystemInfo(&system_info);
    const bool os_is_64_bit = system_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64;
    return os_is_64_bit && !wow64;
}

} // namespace bridge::win32