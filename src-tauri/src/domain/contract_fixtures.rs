#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use crate::domain::bridge_protocol::all_protocol_names;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BridgeCommandEnvelope {
        schema_version: u32,
        command_version: u32,
        operation: String,
        request_id: String,
        payload: serde_json::Value,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BridgeResponseEnvelope {
        schema_version: u32,
        command_version: u32,
        request_id: String,
        ok: bool,
        result: Option<serde_json::Value>,
        error: Option<serde_json::Value>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkspaceContractVersions {
        tauri_command_version: u32,
        bridge_protocol_version: u32,
        analysis_schema_version: u32,
        workflow_schema_version: u32,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BridgeOperationRegistry {
        schema_version: u32,
        protocol_version: u32,
        groups: serde_json::Value,
        operations: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkflowEnvelope {
        format: String,
        schema_version: u32,
        saved_at: String,
        document: WorkflowDocument,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkflowDocument {
        schema_version: u32,
        id: String,
        nodes: Vec<WorkflowNode>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkflowNode {
        id: String,
        node_type: String,
        type_version: u32,
        document_state: serde_json::Value,
    }

    #[test]
    fn bridge_command_fixture_matches_protocol_v2() {
        let fixture: BridgeCommandEnvelope = serde_json::from_str(include_str!("../../../contract-fixtures/bridge-command-envelope.json"))
            .expect("bridge command fixture should deserialize");

        assert_eq!(fixture.schema_version, 1);
        assert_eq!(fixture.command_version, 2);
        assert_eq!(fixture.operation, "runtime-method-invoke");
        assert_eq!(fixture.request_id, "bridge-42-1");
        assert!(fixture.payload.is_object());
        assert_eq!(fixture.payload["arguments"][0]["valueKind"], "address");
        assert_eq!(fixture.payload["arguments"][0]["typeName"], "UnityEngine.Transform");
    }

    #[test]
    fn bridge_response_fixture_matches_protocol_v2() {
        let fixture: BridgeResponseEnvelope = serde_json::from_str(include_str!("../../../contract-fixtures/bridge-response-envelope.json"))
            .expect("bridge response fixture should deserialize");

        assert_eq!(fixture.schema_version, 1);
        assert_eq!(fixture.command_version, 2);
        assert_eq!(fixture.request_id, "bridge-42-1");
        assert!(fixture.ok);
        assert!(fixture.result.is_some());
        assert!(fixture.error.is_none());
    }

    #[test]
    fn bridge_operation_registry_fixture_matches_protocol_surface() {
        let fixture: BridgeOperationRegistry = serde_json::from_str(include_str!("../../../contract-fixtures/bridge-operation-registry.json"))
            .expect("bridge operation registry fixture should deserialize");

        assert_eq!(fixture.schema_version, 1);
        assert_eq!(fixture.protocol_version, 2);
        assert!(fixture.groups.is_object());
        assert_eq!(fixture.operations.len(), all_protocol_names().len());
        assert_eq!(fixture.operations, all_protocol_names().into_iter().map(str::to_string).collect::<Vec<_>>());
    }

    #[test]
    fn workflow_fixture_matches_current_schema() {
        let fixture: WorkflowEnvelope = serde_json::from_str(include_str!("../../../contract-fixtures/workflow-envelope.json"))
            .expect("workflow fixture should deserialize");

        assert_eq!(fixture.format, "studio-graph");
        assert_eq!(fixture.schema_version, 1);
        assert_eq!(fixture.saved_at, "2026-03-22T10:00:00.000Z");
        assert_eq!(fixture.document.schema_version, 1);
        assert_eq!(fixture.document.id, "studio-document");
        assert_eq!(fixture.document.nodes.len(), 1);
        assert_eq!(fixture.document.nodes[0].id, "trigger-1");
        assert_eq!(fixture.document.nodes[0].node_type, "trigger");
        assert_eq!(fixture.document.nodes[0].type_version, 1);
        assert_eq!(fixture.document.nodes[0].document_state["mode"], "manual");
    }

    #[test]
    fn workspace_versions_fixture_matches_exposed_versions() {
        let fixture: WorkspaceContractVersions = serde_json::from_str(include_str!("../../../contract-fixtures/workspace-contract-versions.json"))
            .expect("workspace versions fixture should deserialize");

        assert_eq!(fixture.tauri_command_version, 1);
        assert_eq!(fixture.bridge_protocol_version, 2);
        assert_eq!(fixture.analysis_schema_version, 2);
        assert_eq!(fixture.workflow_schema_version, 1);
    }
}