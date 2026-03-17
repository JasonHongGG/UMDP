#include "win32/RemoteCall.h"

#include <Windows.h>

#include <cstdint>
#include <vector>

#include "win32/Memory.h"
#include "win32/RemoteMemory.h"

namespace bridge::win32 {

RemoteCallInvoker::RemoteCallInvoker(const Memory& memory, Address root_domain, Address attach, Address detach)
    : memory_(memory), root_domain_(root_domain), attach_(attach), detach_(detach)
{
}

Address RemoteCallInvoker::Invoke(Address function_address, const std::vector<Address>& arguments, bool attach_thread) const
{
    RemoteAllocation block(memory_, 4096, PAGE_EXECUTE_READWRITE);
    const Address code_address = block.address();
    const Address return_address = code_address + 0x300;
    const Address thread_address = code_address + 0x320;

    std::vector<std::uint8_t> code;
    const auto stack_size = ComputeStackSize(arguments.size());
    Emit(code, { 0x48, 0x83, 0xEC, stack_size });

    if (attach_thread) {
        EmitMovRegImm64(code, Register64::RCX, root_domain_);
        EmitMovRegImm64(code, Register64::RAX, attach_);
        Emit(code, { 0xFF, 0xD0 });
        EmitMovRegImm64(code, Register64::R12, thread_address);
        Emit(code, { 0x49, 0x89, 0x04, 0x24 });
    }

    for (std::size_t index = 0; index < (std::min<std::size_t>)(4, arguments.size()); ++index) {
        EmitMovArgument(code, index, arguments[index]);
    }

    for (std::size_t index = 4; index < arguments.size(); ++index) {
        EmitMovRegImm64(code, Register64::RAX, arguments[index]);
        Emit(code, { 0x48, 0x89, 0x44, 0x24, static_cast<std::uint8_t>(0x20 + (index - 4) * 8) });
    }

    EmitMovRegImm64(code, Register64::RAX, function_address);
    Emit(code, { 0xFF, 0xD0 });
    EmitMovRegImm64(code, Register64::R12, return_address);
    Emit(code, { 0x49, 0x89, 0x04, 0x24 });

    if (attach_thread) {
        EmitMovRegImm64(code, Register64::R12, thread_address);
        Emit(code, { 0x49, 0x8B, 0x0C, 0x24 });
        EmitMovRegImm64(code, Register64::RAX, detach_);
        Emit(code, { 0xFF, 0xD0 });
    }

    Emit(code, { 0x48, 0x83, 0xC4, stack_size, 0xC3 });

    const std::uint64_t zero = 0;
    memory_.Write(return_address, zero);
    memory_.Write(thread_address, zero);
    memory_.Write(code_address, code.data(), code.size());
    memory_.Protect(code_address, 4096, PAGE_EXECUTE_READWRITE);
    memory_.Execute(code_address);
    return memory_.Read<Address>(return_address);
}

unsigned char RemoteCallInvoker::ComputeStackSize(std::size_t argument_count)
{
    unsigned char stack_size = 0x28;
    if (argument_count > 4) {
        stack_size = static_cast<unsigned char>(stack_size + ((argument_count - 4 + 1) / 2) * 0x10);
    }

    return stack_size;
}

void RemoteCallInvoker::Emit(std::vector<std::uint8_t>& code, std::initializer_list<std::uint8_t> bytes)
{
    code.insert(code.end(), bytes.begin(), bytes.end());
}

void RemoteCallInvoker::EmitQword(std::vector<std::uint8_t>& code, Address value)
{
    const auto* bytes = reinterpret_cast<const std::uint8_t*>(&value);
    code.insert(code.end(), bytes, bytes + sizeof(value));
}

void RemoteCallInvoker::EmitMovRegImm64(std::vector<std::uint8_t>& code, Register64 reg, Address value)
{
    switch (reg) {
    case Register64::RAX:
        Emit(code, { 0x48, 0xB8 });
        break;
    case Register64::RCX:
        Emit(code, { 0x48, 0xB9 });
        break;
    case Register64::RDX:
        Emit(code, { 0x48, 0xBA });
        break;
    case Register64::R8:
        Emit(code, { 0x49, 0xB8 });
        break;
    case Register64::R9:
        Emit(code, { 0x49, 0xB9 });
        break;
    case Register64::R12:
        Emit(code, { 0x49, 0xBC });
        break;
    }

    EmitQword(code, value);
}

void RemoteCallInvoker::EmitMovArgument(std::vector<std::uint8_t>& code, std::size_t index, Address value)
{
    switch (index) {
    case 0:
        EmitMovRegImm64(code, Register64::RCX, value);
        break;
    case 1:
        EmitMovRegImm64(code, Register64::RDX, value);
        break;
    case 2:
        EmitMovRegImm64(code, Register64::R8, value);
        break;
    case 3:
        EmitMovRegImm64(code, Register64::R9, value);
        break;
    default:
        break;
    }
}

} // namespace bridge::win32