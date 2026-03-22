using System.Text.Json;
using Xunit;

namespace ManagedMetadataReader.Tests;

public class ContractFixtureTests
{
    private static JsonElement LoadFixture(string fileName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "contract-fixtures", fileName);
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.Clone();
    }

    [Fact]
    public void BridgeCommandFixture_MatchesProtocolV2Envelope()
    {
        var root = LoadFixture("bridge-command-envelope.json");

        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(2, root.GetProperty("commandVersion").GetInt32());
        Assert.Equal("runtime-method-invoke", root.GetProperty("operation").GetString());
        Assert.Equal("bridge-42-1", root.GetProperty("requestId").GetString());

        var payload = root.GetProperty("payload");
        Assert.Equal("class:image:Assembly-CSharp.dll|Gameplay|PlayerController", payload.GetProperty("classStableId").GetString());
        Assert.Equal("0x0000000000001000", payload.GetProperty("instanceAddress").GetString());

        var arguments = payload.GetProperty("arguments");
        Assert.Single(arguments.EnumerateArray());
    }

    [Fact]
    public void BridgeResponseFixture_MatchesSuccessfulInvocationEnvelope()
    {
        var root = LoadFixture("bridge-response-envelope.json");

        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(2, root.GetProperty("commandVersion").GetInt32());
        Assert.True(root.GetProperty("ok").GetBoolean());
        Assert.True(root.GetProperty("error").ValueKind == JsonValueKind.Null);

        var result = root.GetProperty("result");
        Assert.True(result.GetProperty("success").GetBoolean());
        Assert.Equal("Move", result.GetProperty("methodName").GetString());
        Assert.Equal("none", result.GetProperty("failureKind").GetString());

        var methodResult = result.GetProperty("result");
        Assert.Equal("void", methodResult.GetProperty("kind").GetString());
        Assert.True(methodResult.GetProperty("value").ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public void WorkflowEnvelopeFixture_MatchesStudioGraphEnvelope()
    {
        var root = LoadFixture("workflow-envelope.json");

        Assert.Equal("studio-graph", root.GetProperty("format").GetString());
        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());

        var document = root.GetProperty("document");
        Assert.Equal("studio-document", document.GetProperty("id").GetString());
        Assert.Equal(1, document.GetProperty("schemaVersion").GetInt32());

        var nodes = document.GetProperty("nodes");
        var node = Assert.Single(nodes.EnumerateArray());
        Assert.Equal("trigger", node.GetProperty("nodeType").GetString());
        Assert.Equal(1, node.GetProperty("typeVersion").GetInt32());
    }

    [Fact]
    public void WorkspaceContractVersionsFixture_MatchesReleaseGateVersions()
    {
        var root = LoadFixture("workspace-contract-versions.json");

        Assert.Equal(1, root.GetProperty("tauriCommandVersion").GetInt32());
        Assert.Equal(2, root.GetProperty("bridgeProtocolVersion").GetInt32());
        Assert.Equal(1, root.GetProperty("analysisSchemaVersion").GetInt32());
        Assert.Equal(1, root.GetProperty("workflowSchemaVersion").GetInt32());
    }
}