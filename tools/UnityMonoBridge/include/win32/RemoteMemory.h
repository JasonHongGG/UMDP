#pragma once

#include <string>

#include "shared/Types.h"

namespace bridge::win32 {

class Memory;

class RemoteAllocation {
public:
    RemoteAllocation(const Memory& memory, std::size_t size, unsigned long protection);
    ~RemoteAllocation();

    RemoteAllocation(const RemoteAllocation&) = delete;
    RemoteAllocation& operator=(const RemoteAllocation&) = delete;

    Address address() const;

private:
    const Memory& memory_;
    Address address_ = 0;
};

class RemoteUtf8String {
public:
    RemoteUtf8String(const Memory& memory, const std::string& value);

    Address address() const;

private:
    RemoteAllocation storage_;
};

} // namespace bridge::win32