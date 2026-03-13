#pragma once

#include <vector>

#include "shared/Types.h"

namespace bridge::win32 {

class Memory;

class RemoteCallInvoker {
public:
    RemoteCallInvoker(const Memory& memory, Address root_domain, Address attach, Address detach);

    Address Invoke(Address function_address, const std::vector<Address>& arguments, bool attach_thread = true) const;

private:
    enum class Register64 {
        RAX,
        RCX,
        RDX,
        R8,
        R9,
        R12,
    };

    static unsigned char ComputeStackSize(std::size_t argument_count);
    static void Emit(std::vector<std::uint8_t>& code, std::initializer_list<std::uint8_t> bytes);
    static void EmitQword(std::vector<std::uint8_t>& code, Address value);
    static void EmitMovRegImm64(std::vector<std::uint8_t>& code, Register64 reg, Address value);
    static void EmitMovArgument(std::vector<std::uint8_t>& code, std::size_t index, Address value);

    const Memory& memory_;
    Address root_domain_ = 0;
    Address attach_ = 0;
    Address detach_ = 0;
};

} // namespace bridge::win32