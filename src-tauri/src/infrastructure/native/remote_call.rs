use crate::infrastructure::native::memory::RemoteMemory;
use windows::Win32::System::Memory::PAGE_EXECUTE_READWRITE;

#[derive(Clone)]
pub struct RemoteCallInvoker {
    memory: RemoteMemory,
    root_domain: usize,
    attach: usize,
    detach: usize,
}

#[derive(Clone, Copy)]
enum Register64 {
    Rax,
    Rcx,
    Rdx,
    R8,
    R9,
    R12,
}

impl RemoteCallInvoker {
    pub fn new(memory: RemoteMemory, root_domain: usize, attach: usize, detach: usize) -> Self {
        Self {
            memory,
            root_domain,
            attach,
            detach,
        }
    }

    pub fn invoke(&self, function_address: usize, arguments: &[usize], attach_thread: bool) -> Result<usize, String> {
        let block = self.memory.allocate(4096, PAGE_EXECUTE_READWRITE.0)?;
        let code_address = block.address;
        let return_address = code_address + 0x300;
        let thread_address = code_address + 0x320;

        let mut code = Vec::new();
        let stack_size = compute_stack_size(arguments.len());
        emit(&mut code, &[0x48, 0x83, 0xEC, stack_size]);

        if attach_thread {
            emit_mov_reg_imm64(&mut code, Register64::Rcx, self.root_domain);
            emit_mov_reg_imm64(&mut code, Register64::Rax, self.attach);
            emit(&mut code, &[0xFF, 0xD0]);
            emit_mov_reg_imm64(&mut code, Register64::R12, thread_address);
            emit(&mut code, &[0x49, 0x89, 0x04, 0x24]);
        }

        for (index, argument) in arguments.iter().take(4).enumerate() {
            emit_mov_argument(&mut code, index, *argument);
        }

        for (index, argument) in arguments.iter().enumerate().skip(4) {
            emit_mov_reg_imm64(&mut code, Register64::Rax, *argument);
            emit(
                &mut code,
                &[0x48, 0x89, 0x44, 0x24, (0x20 + ((index - 4) * 8)) as u8],
            );
        }

        emit_mov_reg_imm64(&mut code, Register64::Rax, function_address);
        emit(&mut code, &[0xFF, 0xD0]);
        emit_mov_reg_imm64(&mut code, Register64::R12, return_address);
        emit(&mut code, &[0x49, 0x89, 0x04, 0x24]);

        if attach_thread {
            emit_mov_reg_imm64(&mut code, Register64::R12, thread_address);
            emit(&mut code, &[0x49, 0x8B, 0x0C, 0x24]);
            emit_mov_reg_imm64(&mut code, Register64::Rax, self.detach);
            emit(&mut code, &[0xFF, 0xD0]);
        }

        emit(&mut code, &[0x48, 0x83, 0xC4, stack_size, 0xC3]);

        self.memory.write_value(return_address, &0usize)?;
        self.memory.write_value(thread_address, &0usize)?;
        self.memory.write_bytes(code_address, &code)?;
        self.memory.protect(code_address, block.size, PAGE_EXECUTE_READWRITE.0)?;
        self.memory.execute(code_address)?;
        self.memory.read_value(return_address)
    }
}

fn compute_stack_size(argument_count: usize) -> u8 {
    let mut stack_size: u8 = 0x28;
    if argument_count > 4 {
        stack_size = stack_size.saturating_add((((argument_count - 4 + 1) / 2) * 0x10) as u8);
    }
    stack_size
}

fn emit(code: &mut Vec<u8>, bytes: &[u8]) {
    code.extend_from_slice(bytes);
}

fn emit_qword(code: &mut Vec<u8>, value: usize) {
    code.extend_from_slice(&(value as u64).to_le_bytes());
}

fn emit_mov_reg_imm64(code: &mut Vec<u8>, reg: Register64, value: usize) {
    match reg {
        Register64::Rax => emit(code, &[0x48, 0xB8]),
        Register64::Rcx => emit(code, &[0x48, 0xB9]),
        Register64::Rdx => emit(code, &[0x48, 0xBA]),
        Register64::R8 => emit(code, &[0x49, 0xB8]),
        Register64::R9 => emit(code, &[0x49, 0xB9]),
        Register64::R12 => emit(code, &[0x49, 0xBC]),
    }
    emit_qword(code, value);
}

fn emit_mov_argument(code: &mut Vec<u8>, index: usize, value: usize) {
    match index {
        0 => emit_mov_reg_imm64(code, Register64::Rcx, value),
        1 => emit_mov_reg_imm64(code, Register64::Rdx, value),
        2 => emit_mov_reg_imm64(code, Register64::R8, value),
        3 => emit_mov_reg_imm64(code, Register64::R9, value),
        _ => {}
    }
}