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

        Assert.Equal(4, root.GetProperty("tauriCommandVersion").GetInt32());
        Assert.Equal(5, root.GetProperty("analysisSchemaVersion").GetInt32());
        Assert.Equal(1, root.GetProperty("workflowSchemaVersion").GetInt32());
    }
}