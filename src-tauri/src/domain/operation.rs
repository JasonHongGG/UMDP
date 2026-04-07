use std::error::Error;
use std::fmt;
use std::fmt::Display;
#[allow(unused_imports)]
pub use crate::generated::contracts::operation::{
    CommandEnvelope, OperationDisplayHint, OperationErrorCode, OperationErrorEnvelope,
    OperationFailureEffect, OperationFeedbackEnvelope, OperationFeedbackTone,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationError {
    pub code: OperationErrorCode,
    pub message: String,
    pub effect: OperationFailureEffect,
}

pub type OperationResult<T> = Result<T, OperationError>;
pub type AsyncCommandResult<T> = Result<CommandEnvelope<T>, String>;

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

    pub fn scene_component_capability_unavailable(message: impl Into<String>) -> Self {
        Self::capability_unavailable(message)
    }

    pub fn resource_fault(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::ResourceUnavailable, message)
    }

    pub fn scene_component_resource_fault(message: impl Into<String>) -> Self {
        Self::resource_fault(message)
    }

    pub fn runtime_fault(message: impl Into<String>) -> Self {
        Self::new(OperationErrorCode::RuntimeFault, message)
            .with_effect(OperationFailureEffect::RuntimeSessionDropped)
    }

    pub fn public_message(&self) -> String {
        self.message.clone()
    }

    pub fn into_envelope(self, operation_key: Option<&str>) -> OperationErrorEnvelope {
        let recoverable = self.effect == OperationFailureEffect::None;
        let display_hint = match self.code {
            OperationErrorCode::ArgumentMismatch
            | OperationErrorCode::InvalidAddress
            | OperationErrorCode::InstanceRequired => OperationDisplayHint::Inline,
            OperationErrorCode::ResourceUnavailable
            | OperationErrorCode::RuntimeFault
            | OperationErrorCode::RuntimeApiUnavailable
            | OperationErrorCode::RuntimeSessionUnavailable => OperationDisplayHint::Banner,
            _ => OperationDisplayHint::Banner,
        };

        OperationErrorEnvelope {
            code: self.code,
            message: self.message,
            effect: self.effect,
            operation_key: operation_key.map(str::to_owned),
            recoverable,
            display_hint,
        }
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

        if lower.starts_with("scene object component enumeration is unavailable") {
            return Self::capability_unavailable(message);
        }

        if lower.starts_with("scene object component enumeration returned no materialized components")
            || lower.starts_with("scene object component load was incomplete")
            || (lower.starts_with("scene object reported ")
                && lower.contains("components")
                && lower.contains("materialized"))
        {
            return Self::resource_fault(message);
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

#[cfg(test)]
mod tests {
    use super::{OperationError, OperationErrorCode, OperationFailureEffect};

    #[test]
    fn scene_component_capability_failures_stay_local() {
        let error = OperationError::from(
            "Scene object component enumeration is unavailable: GameObject.GetComponentCount is missing."
                .to_string(),
        );

        assert_eq!(error.code, OperationErrorCode::CapabilityUnavailable);
        assert_eq!(error.effect, OperationFailureEffect::None);
    }

    #[test]
    fn scene_component_materialization_failures_do_not_drop_runtime_session() {
        let error = OperationError::from(
            "Scene object component load was incomplete: loaded 1 of 3 components.".to_string(),
        );

        assert_eq!(error.code, OperationErrorCode::ResourceUnavailable);
        assert_eq!(error.effect, OperationFailureEffect::None);
    }

    #[test]
    fn unknown_runtime_faults_still_drop_runtime_session() {
        let error = OperationError::from("Background runtime bridge crashed unexpectedly.".to_string());

        assert_eq!(error.code, OperationErrorCode::RuntimeFault);
        assert_eq!(error.effect, OperationFailureEffect::RuntimeSessionDropped);
    }
}

pub fn command_success<T>(data: T) -> CommandEnvelope<T> {
    CommandEnvelope {
        ok: true,
        data: Some(data),
        error: None,
        feedback: None,
    }
}

pub fn command_error<T>(error: impl Into<OperationError>, operation_key: &'static str) -> CommandEnvelope<T> {
    CommandEnvelope {
        ok: false,
        data: None,
        error: Some(error.into().into_envelope(Some(operation_key))),
        feedback: None,
    }
}

pub fn command_result<T>(result: OperationResult<T>, operation_key: &'static str) -> CommandEnvelope<T> {
    match result {
        Ok(data) => command_success(data),
        Err(error) => command_error(error, operation_key),
    }
}

pub fn background_task_failure<T>(operation_key: &'static str, error: impl Display) -> CommandEnvelope<T> {
    command_error(
        OperationError::runtime_fault(format!("Background task failed: {error}")),
        operation_key,
    )
}
