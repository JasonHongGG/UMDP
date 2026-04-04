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

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SceneResourceContractFixture {
        workspace: SceneWorkspaceFixture,
        children_task: SceneTaskFixture,
        inspector_task: SceneInspectorTaskFixture,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SceneWorkspaceFixture {
        resource_revision: u64,
        session_key: Option<String>,
        refresh_status: String,
        mutation_epoch: u64,
        resource_state: SceneResourceStateFixture,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SceneTaskFixture {
        task_id: u64,
        resource_revision: u64,
        session_key: Option<String>,
        status: String,
        resource_state: SceneResourceStateFixture,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SceneInspectorTaskFixture {
        task_id: u64,
        resource_revision: u64,
        session_key: Option<String>,
        status: String,
        resource_state: SceneResourceStateFixture,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SceneResourceStateFixture {
        resource_kind: String,
        resource_revision: u64,
        session_key: Option<String>,
        freshness: String,
        last_successful_at: Option<String>,
        is_retaining_snapshot: bool,
        error_message: Option<String>,
    }

    #[test]
    fn workflow_fixture_matches_current_schema() {
        let fixture: WorkflowEnvelope = serde_json::from_str(include_str!(
            "../../../contract-fixtures/workflow-envelope.json"
        ))
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
        let fixture: WorkspaceContractVersions = serde_json::from_str(include_str!(
            "../../../contract-fixtures/workspace-contract-versions.json"
        ))
        .expect("workspace versions fixture should deserialize");

        assert_eq!(fixture.tauri_command_version, 2);
        assert_eq!(fixture.analysis_schema_version, 3);
        assert_eq!(fixture.workflow_schema_version, 1);
    }

    #[test]
    fn scene_resource_fixture_matches_current_scene_contracts() {
        let fixture: SceneResourceContractFixture = serde_json::from_str(include_str!(
            "../../../contract-fixtures/scene-resource-contract.json"
        ))
        .expect("scene resource fixture should deserialize");

        assert_eq!(fixture.workspace.resource_revision, 7);
        assert_eq!(fixture.workspace.session_key.as_deref(), Some("session-1"));
        assert_eq!(fixture.workspace.refresh_status, "ready");
        assert_eq!(fixture.workspace.mutation_epoch, 3);
        assert_eq!(fixture.workspace.resource_state.resource_kind, "catalog");
        assert_eq!(fixture.workspace.resource_state.freshness, "fresh");
        assert_eq!(fixture.workspace.resource_state.resource_revision, 7);
        assert!(fixture.workspace.resource_state.is_retaining_snapshot);
        assert_eq!(fixture.children_task.task_id, 11);
        assert_eq!(fixture.children_task.resource_revision, 9);
        assert_eq!(fixture.children_task.status, "loading");
        assert_eq!(fixture.children_task.resource_state.resource_kind, "children");
        assert_eq!(fixture.children_task.resource_state.freshness, "refreshing");
        assert_eq!(fixture.children_task.resource_state.session_key.as_deref(), Some("session-1"));
        assert_eq!(fixture.inspector_task.task_id, 12);
        assert_eq!(fixture.inspector_task.resource_revision, 10);
        assert_eq!(fixture.inspector_task.status, "components-loading");
        assert_eq!(fixture.inspector_task.resource_state.resource_kind, "inspector");
        assert_eq!(fixture.inspector_task.resource_state.freshness, "refreshing");
        assert!(fixture.inspector_task.resource_state.last_successful_at.is_some());
        assert!(fixture.inspector_task.resource_state.error_message.is_none());
    }
}
