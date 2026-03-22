use crate::domain::analysis_models::{
    AnalysisSnapshot, ClassDescriptor, MethodDescriptor, RuntimeFieldSetRequest,
    RuntimeFieldValueKind, RuntimeInvokeArgumentKind, RuntimeMethodInvokeArgument,
};
use crate::domain::bridge_protocol::BridgeOperation;
use crate::services::analysis::bridge_transport::{execute_json_with, BridgeRequest, BridgeTransport};
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct HelperRuntimeStaticFields {
    pub static_fields: Vec<HelperStaticField>,
    pub fields: Vec<HelperField>,
}

#[derive(Debug, Deserialize)]
pub struct HelperField {
    pub address: Option<String>,
    pub value: Option<String>,
    pub offset: Option<String>,
    pub name: String,
    pub field_type: String,
}

#[derive(Debug, Deserialize)]
pub struct HelperStaticField {
    pub address: Option<String>,
    pub value: Option<String>,
    pub name: String,
    pub field_type: String,
}

#[derive(Debug, Deserialize)]
pub struct HelperInvokeValue {
    pub kind: String,
    pub value: Option<String>,
    pub object_address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HelperInvokeResponse {
    pub success: bool,
    pub method_name: String,
    pub method_signature: String,
    pub return_type: String,
    pub error: Option<String>,
    pub exception: Option<String>,
    pub result: Option<HelperInvokeValue>,
}

#[derive(Debug, Deserialize)]
pub struct HelperFieldSetResponse {
    pub success: bool,
    pub failure_kind: String,
    pub field_name: String,
    pub field_type: String,
    pub is_static: bool,
    pub address: Option<String>,
    pub error: Option<String>,
    pub previous_value: Option<String>,
    pub applied_value: Option<String>,
}

pub fn current_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    now.to_string()
}

pub trait BridgeGateway {
    fn load_all_metadata(&self, app: &AppHandle, metadata_input: &str) -> Result<AnalysisSnapshot, String>;

    fn load_runtime_overlay(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        instance_address: Option<&str>,
    ) -> Result<HelperRuntimeStaticFields, String>;

    fn invoke_runtime_method(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        method: &MethodDescriptor,
        instance_address: Option<&str>,
        arguments: &[RuntimeMethodInvokeArgument],
    ) -> Result<HelperInvokeResponse, String>;

    fn set_runtime_field_value(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        request: &RuntimeFieldSetRequest,
    ) -> Result<HelperFieldSetResponse, String>;
}

pub struct ProcessBridgeGateway<TTransport>
where
    TTransport: BridgeTransport,
{
    transport: TTransport,
}

impl<TTransport> ProcessBridgeGateway<TTransport>
where
    TTransport: BridgeTransport,
{
    pub fn new(transport: TTransport) -> Self {
        Self { transport }
    }

    fn execute_json<T>(&self, app: &AppHandle, request: BridgeRequest) -> Result<T, String>
    where
        T: serde::de::DeserializeOwned,
    {
        execute_json_with(&self.transport, app, request)
    }
}

impl<TTransport> BridgeGateway for ProcessBridgeGateway<TTransport>
where
    TTransport: BridgeTransport,
{
    fn load_all_metadata(&self, app: &AppHandle, metadata_input: &str) -> Result<AnalysisSnapshot, String> {
        self.execute_json(
            app,
            BridgeRequest {
                operation: BridgeOperation::AnalysisSnapshotLoad,
                executable_name: "ManagedMetadataReader.exe",
                args: vec!["dump-all".into(), metadata_input.to_string()],
            },
        )
    }

    fn load_runtime_overlay(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        instance_address: Option<&str>,
    ) -> Result<HelperRuntimeStaticFields, String> {
        let mut args = vec![
            "--pid".into(),
            pid.to_string(),
            "--image".into(),
            descriptor.bridge_image_name.clone(),
            "--namespace".into(),
            descriptor.namespace.clone(),
            "--class".into(),
            descriptor.name.clone(),
        ];

        if let Some(address) = instance_address {
            args.push("--instance".into());
            args.push(address.to_string());
        }

        self.execute_json(
            app,
            BridgeRequest {
                operation: BridgeOperation::AnalysisOverlayLoad,
                executable_name: "UnityMonoBridge.exe",
                args,
            },
        )
    }

    fn invoke_runtime_method(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        method: &MethodDescriptor,
        instance_address: Option<&str>,
        arguments: &[RuntimeMethodInvokeArgument],
    ) -> Result<HelperInvokeResponse, String> {
        let mut args = vec![
            "--operation".into(),
            "invoke".into(),
            "--pid".into(),
            pid.to_string(),
            "--image".into(),
            descriptor.bridge_image_name.clone(),
            "--namespace".into(),
            descriptor.namespace.clone(),
            "--class".into(),
            descriptor.name.clone(),
            "--method-name".into(),
            method.name.clone(),
            "--method-signature".into(),
            method.signature.clone(),
        ];

        if let Some(address) = instance_address {
            args.push("--instance".into());
            args.push(address.to_string());
        }

        for argument in arguments {
            push_invoke_argument(&mut args, argument);
        }

        self.execute_json(
            app,
            BridgeRequest {
                operation: BridgeOperation::RuntimeMethodInvoke,
                executable_name: "UnityMonoBridge.exe",
                args,
            },
        )
    }

    fn set_runtime_field_value(
        &self,
        app: &AppHandle,
        pid: u32,
        descriptor: &ClassDescriptor,
        request: &RuntimeFieldSetRequest,
    ) -> Result<HelperFieldSetResponse, String> {
        let mut args = vec![
            "--operation".into(),
            "set-field".into(),
            "--pid".into(),
            pid.to_string(),
            "--image".into(),
            descriptor.bridge_image_name.clone(),
            "--namespace".into(),
            descriptor.namespace.clone(),
            "--class".into(),
            descriptor.name.clone(),
            "--field-name".into(),
            request.field_name.clone(),
            "--field-type".into(),
            request.field_type_name.clone(),
            "--field-static".into(),
            if request.is_static { "true".into() } else { "false".into() },
            "--value-kind".into(),
            encode_value_kind(&request.value_kind).into(),
        ];

        if let Some(instance_address) = &request.instance_address {
            args.push("--instance".into());
            args.push(instance_address.clone());
        }
        if let Some(target_address) = &request.target_address {
            args.push("--target-address".into());
            args.push(target_address.clone());
        }
        if let Some(serialized_value) = &request.serialized_value {
            args.push("--field-value".into());
            args.push(serialized_value.clone());
        }

        self.execute_json(
            app,
            BridgeRequest {
                operation: BridgeOperation::RuntimeFieldWrite,
                executable_name: "UnityMonoBridge.exe",
                args,
            },
        )
    }
}

fn push_invoke_argument(args: &mut Vec<String>, argument: &RuntimeMethodInvokeArgument) {
    let kind = match argument.value_kind {
        RuntimeInvokeArgumentKind::Null => "null",
        RuntimeInvokeArgumentKind::Boolean => "boolean",
        RuntimeInvokeArgumentKind::Number => "number",
        RuntimeInvokeArgumentKind::String => "string",
    };

    args.push("--arg-kind".into());
    args.push(kind.into());
    if let Some(value) = &argument.value {
        args.push("--arg-value".into());
        args.push(value.clone());
    }
}

fn encode_value_kind(kind: &RuntimeFieldValueKind) -> &'static str {
    match kind {
        RuntimeFieldValueKind::Boolean => "boolean",
        RuntimeFieldValueKind::Integer => "integer",
        RuntimeFieldValueKind::Float => "float",
        RuntimeFieldValueKind::String => "string",
        RuntimeFieldValueKind::Address => "address",
    }
}
