#pragma once

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <Windows.h>

#include <optional>
#include <string>
#include <vector>

#include "shared/Types.h"

namespace bridge::win32 {

struct ModuleInfo {
    std::wstring name;
    std::wstring path;
    Address base = 0;
};

class Process {
public:
    explicit Process(std::size_t pid);
    ~Process();

    Process(const Process&) = delete;
    Process& operator=(const Process&) = delete;

    HANDLE handle() const;
    std::vector<ModuleInfo> EnumerateModules() const;
    std::optional<ModuleInfo> FindModule(const std::vector<std::wstring>& candidates) const;

private:
    bool Is64BitProcess() const;

    DWORD pid_ = 0;
    HANDLE handle_ = nullptr;
};

} // namespace bridge::win32