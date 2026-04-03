use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use crate::infrastructure::native::il2cpp_runtime_api::Il2CppRuntimeApi;
use crate::infrastructure::native::memory::RemoteMemory;
use crate::infrastructure::native::mono_runtime_api::MonoRuntimeApi;
use crate::infrastructure::native::process;
use crate::infrastructure::native::runtime_api::RuntimeApi;

pub struct RuntimeSession {
    pid: u32,
    runtime_api: Option<Box<dyn RuntimeApi>>,
}

impl RuntimeSession {
    pub fn create(process_session: &ProcessSession) -> Result<Self, String> {
        let detected_runtime = process::detect_runtime_flavor(process_session.pid)?;
        let runtime = prefer_detected_runtime(&process_session.runtime, detected_runtime);

        let runtime_api = match runtime {
            RuntimeFlavor::Mono => {
                let memory = RemoteMemory::open(process_session.pid)?;
                Some(Box::new(MonoRuntimeApi::new(memory)?) as Box<dyn RuntimeApi>)
            }
            RuntimeFlavor::Il2cpp => {
                let memory = RemoteMemory::open(process_session.pid)?;
                Some(Box::new(Il2CppRuntimeApi::new(memory)?) as Box<dyn RuntimeApi>)
            }
            RuntimeFlavor::Unknown => None,
        };

        Ok(Self {
            pid: process_session.pid,
            runtime_api,
        })
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn runtime_api(&self) -> Option<&dyn RuntimeApi> {
        self.runtime_api.as_deref()
    }
}

fn prefer_detected_runtime(existing: &RuntimeFlavor, detected: RuntimeFlavor) -> RuntimeFlavor {
    match detected {
        RuntimeFlavor::Unknown => existing.clone(),
        other => other,
    }
}