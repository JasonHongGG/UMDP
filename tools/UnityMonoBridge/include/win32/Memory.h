#pragma once

#include <string>

#include "shared/Types.h"

namespace bridge::win32 {

class Process;

class Memory {
public:
    explicit Memory(const Process& process);

    Address Allocate(std::size_t size, unsigned long protection) const;
    unsigned long Protect(Address address, std::size_t size, unsigned long protection) const;
    void Free(Address address) const;
    void Write(Address address, const void* buffer, std::size_t size) const;
    void Read(Address address, void* buffer, std::size_t size) const;
    std::string ReadUtf8(Address address, std::size_t max_length = 4096) const;
    std::u16string ReadUtf16(Address address, std::size_t char_count) const;
    void Execute(Address entry_point) const;

    template <typename T>
    void Write(Address address, const T& value) const
    {
        Write(address, &value, sizeof(value));
    }

    template <typename T>
    T Read(Address address) const
    {
        T value{};
        Read(address, &value, sizeof(value));
        return value;
    }

private:
    const Process& process_;
};

} // namespace bridge::win32