use std::error::Error;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationErrorCode {
    ProcessNotFound,
    NotAttached,
    MetadataUnavailable,
    MetadataSourceUnavailable,
    ClassNotFound,
    MethodNotFound,
    FieldNotFound,
    InstanceRequired,
    ArgumentMismatch,
    InvalidAddress,
    RuntimeSessionUnavailable,
    RuntimeApiUnavailable,
    CapabilityUnavailable,
    RuntimeFault,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationFailureEffect {
    None,
    RuntimeSessionDropped,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationError {
    pub code: OperationErrorCode,
    pub message: String,
    pub effect: OperationFailureEffect,
}

pub type OperationResult<T> = Result<T, OperationError>;

impl OperationError {
    pub fn new(code: OperationErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            effect: OperationFailureEffect::None,
        }
    }

    pub fn with_effect(mut self, effect: OperationFailureEffect) -> Self {
        self.effect = effect;
        self
    }

    pub fn process_not_found(pid: u32, name: &str) -> Self {
        Self::new(
            OperationErrorCode::ProcessNotFound,
            format!("Process {} ({}) not found", name, pid),
        )
    }

    pub fn not_attached() -> Self {
        Self::new(OperationErrorCode::NotAttached, "No process attached")
    }

    pub fn metadata_unavailable() -> Self {
        Self::new(
            OperationErrorCode::MetadataUnavailable,
            "Metadata not loaded. Please attach to a process first.",
        )
    }

    pub fn metadata_source_unavailable() -> Self {
        Self::new(
            OperationErrorCode::MetadataSourceUnavailable,
            "Attached process has no Unity data directory or managed directory",
        )
    }

    pub fn class_not_found(class_stable_id: &str) -> Self {
        Self::new(
            OperationErrorCode::ClassNotFound,
            format!("Class details not found for {class_stable_id}"),
        )
    }

    pub fn method_not_found(method_stable_id: &str) -> Self {
        Self::new(
            OperationErrorCode::MethodNotFound,
            format!("Method details not found for {method_stable_id}"),
        )
    }

    pub fn field_not_found(member_stable_id: &str) -> Self {
        Self::new(
            OperationErrorCode::FieldNotFound,
            format!("Field details not found for {member_stable_id}"),
        )
    }

    pub fn instance_required(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::InstanceRequired, message)
    }

    pub fn argument_mismatch(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::ArgumentMismatch, message)
    }

    pub fn invalid_address(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::InvalidAddress, message)
    }

    pub fn runtime_session_unavailable() -> Self {
        Self::new(
            OperationErrorCode::RuntimeSessionUnavailable,
            "Native runtime session is unavailable",
        )
        .with_effect(OperationFailureEffect::RuntimeSessionDropped)
    }

    pub fn runtime_api_unavailable() -> Self {
        Self::new(
            OperationErrorCode::RuntimeApiUnavailable,
            "Native runtime session is missing its runtime API",
        )
        .with_effect(OperationFailureEffect::RuntimeSessionDropped)
    }

    pub fn capability_unavailable(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::CapabilityUnavailable, message)
    }

    pub fn runtime_fault(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::RuntimeFault, message)
            .with_effect(OperationFailureEffect::RuntimeSessionDropped)
    }

    pub fn public_message(&self) -> String {
        self.message.clone()
    }

    fn classify_message(message: impl Into<String>) -> Self {
        let message = message.into();
        let lower = message.to_ascii_lowercase();

        if lower == "no process attached" {
            return Self::not_attached();
        }

        if message.starts_with("Process ") && message.contains(" not found") {
            return Self::new(OperationErrorCode::ProcessNotFound, message);
        }

        if lower.contains("metadata not loaded") {
            return Self::metadata_unavailable();
        }

        if lower.contains("has no unity data directory") {
            return Self::metadata_source_unavailable();
        }

        if message.starts_with("Class details not found for ") {
            return Self::new(OperationErrorCode::ClassNotFound, message);
        }

        if message.starts_with("Method details not found for ") {
            return Self::new(OperationErrorCode::MethodNotFound, message);
        }

        if message.starts_with("Field details not found for ") {
            return Self::new(OperationErrorCode::FieldNotFound, message);
        }

        if lower.contains("instance address is required") {
            return Self::new(OperationErrorCode::InstanceRequired, message);
        }

        if lower.contains("argument count does not match") {
            return Self::new(OperationErrorCode::ArgumentMismatch, message);
        }

        if lower.contains("invalid") && lower.contains("address") {
            return Self::new(OperationErrorCode::InvalidAddress, message);
        }

        if lower.contains("runtime session is unavailable") {
            return Self::runtime_session_unavailable();
        }

        if lower.contains("missing its runtime api") {
            return Self::runtime_api_unavailable();
        }

        Self::runtime_fault(message)
    }
}

impl fmt::Display for OperationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for OperationError {}

impl From<String> for OperationError {
    fn from(value: String) -> Self {
        Self::classify_message(value)
    }
}

impl From<&str> for OperationError {
    fn from(value: &str) -> Self {
        Self::classify_message(value)
    }
}

impl From<OperationError> for String {
    fn from(value: OperationError) -> Self {
        value.message
    }
}