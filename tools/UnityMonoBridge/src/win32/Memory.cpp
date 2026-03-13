#include "win32/Memory.h"

#include <Windows.h>

#include <algorithm>
#include <array>
#include <stdexcept>

#include "win32/Process.h"

namespace bridge::win32 {

Memory::Memory(const Process& process)
    : process_(process)
{
}

Address Memory::Allocate(std::size_t size, unsigned long protection) const
{
    const auto address = reinterpret_cast<Address>(
        VirtualAllocEx(process_.handle(), nullptr, size, MEM_COMMIT | MEM_RESERVE, protection));
    if (address == 0) {
        throw std::runtime_error("failed to allocate remote memory");
    }

    return address;
}

void Memory::Free(Address address) const
{
    if (address != 0) {
        VirtualFreeEx(process_.handle(), reinterpret_cast<void*>(address), 0, MEM_RELEASE);
    }
}

void Memory::Write(Address address, const void* buffer, std::size_t size) const
{
    SIZE_T written = 0;
    if (!WriteProcessMemory(process_.handle(), reinterpret_cast<void*>(address), buffer, size, &written) || written != size) {
        throw std::runtime_error("failed to write remote memory");
    }
}

void Memory::Read(Address address, void* buffer, std::size_t size) const
{
    SIZE_T read = 0;
    if (!ReadProcessMemory(process_.handle(), reinterpret_cast<const void*>(address), buffer, size, &read) || read != size) {
        throw std::runtime_error("failed to read remote memory");
    }
}

std::string Memory::ReadUtf8(Address address, std::size_t max_length) const
{
    if (address == 0) {
        return {};
    }

    std::string result;
    result.reserve((std::min<std::size_t>)(max_length, 256));

    constexpr std::size_t chunk_size = 128;
    Address cursor = address;
    while (result.size() < max_length) {
        std::array<char, chunk_size> chunk{};
        const auto remaining = (std::min)(chunk.size(), max_length - result.size());
        Read(cursor, chunk.data(), remaining);

        const auto terminator = std::find(chunk.begin(), chunk.begin() + static_cast<std::ptrdiff_t>(remaining), '\0');
        result.append(chunk.begin(), terminator);
        if (terminator != chunk.begin() + static_cast<std::ptrdiff_t>(remaining)) {
            break;
        }

        cursor += remaining;
    }

    return result;
}

void Memory::Execute(Address entry_point) const
{
    HANDLE thread = CreateRemoteThread(
        process_.handle(),
        nullptr,
        0,
        reinterpret_cast<LPTHREAD_START_ROUTINE>(entry_point),
        nullptr,
        0,
        nullptr);
    if (thread == nullptr) {
        throw std::runtime_error("failed to create remote thread");
    }

    WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread);
}

} // namespace bridge::win32