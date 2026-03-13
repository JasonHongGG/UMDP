#include "win32/RemoteMemory.h"

#include <Windows.h>

#include <vector>

#include "win32/Memory.h"

namespace bridge::win32 {

RemoteAllocation::RemoteAllocation(const Memory& memory, std::size_t size, unsigned long protection)
    : memory_(memory), address_(memory.Allocate(size, protection))
{
}

RemoteAllocation::~RemoteAllocation()
{
    memory_.Free(address_);
}

Address RemoteAllocation::address() const
{
    return address_;
}

RemoteUtf8String::RemoteUtf8String(const Memory& memory, const std::string& value)
    : storage_(memory, value.size() + 1, PAGE_READWRITE)
{
    std::vector<char> bytes(value.begin(), value.end());
    bytes.push_back('\0');
    memory.Write(storage_.address(), bytes.data(), bytes.size());
}

Address RemoteUtf8String::address() const
{
    return storage_.address();
}

} // namespace bridge::win32