use crate::kernel::runtime::session::RuntimeSession;
use parking_lot::Mutex;
use std::sync::Arc;

#[derive(Default)]
pub struct RuntimeKernelState {
    session: Mutex<Option<Arc<RuntimeSession>>>,
}

impl RuntimeKernelState {
    pub fn session(&self) -> Option<Arc<RuntimeSession>> {
        self.session.lock().clone()
    }

    pub fn set_session(&self, session: Arc<RuntimeSession>) {
        *self.session.lock() = Some(session);
    }

    pub fn reset(&self) {
        self.session.lock().take();
    }

    pub fn has_session(&self) -> bool {
        self.session.lock().is_some()
    }
}