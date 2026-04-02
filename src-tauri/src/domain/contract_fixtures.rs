#[cfg(test)]
mod tests {
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkspaceContractVersions {
        tauri_command_version: u32,
        analysis_schema_version: u32,
        workflow_schema_version: u32,
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
        assert_eq!(fixture.analysis_schema_version, 2);
        assert_eq!(fixture.workflow_schema_version, 1);
    }
}