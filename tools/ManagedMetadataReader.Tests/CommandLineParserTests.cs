using ManagedMetadataReader;
using Xunit;

namespace ManagedMetadataReader.Tests;

public class CommandLineParserTests
{
    [Fact]
    public void Parse_AcceptsDumpAllMode()
    {
        var inputDirectory = Directory.CreateTempSubdirectory();
        try
        {
            var command = CommandLineParser.Parse(["dump-all", inputDirectory.FullName]);

            Assert.Equal(ReaderMode.DumpAll, command.Mode);
            Assert.Equal(inputDirectory.FullName, command.InputDirectory);
        }
        finally
        {
            inputDirectory.Delete(true);
        }
    }

    [Fact]
    public void Parse_RequiresExistingInputDirectory()
    {
        var missingPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

        var error = Assert.Throws<CommandLineException>(() => CommandLineParser.Parse(["images", missingPath]));

        Assert.Equal(2, error.ExitCode);
        Assert.Contains("Input directory not found", error.Message);
    }

    [Fact]
    public void Parse_RequiresImageIdForClassesMode()
    {
        var inputDirectory = Directory.CreateTempSubdirectory();
        try
        {
            var error = Assert.Throws<CommandLineException>(() => CommandLineParser.Parse(["classes", inputDirectory.FullName]));

            Assert.Equal(3, error.ExitCode);
            Assert.Contains("classes <image-id>", error.Message);
        }
        finally
        {
            inputDirectory.Delete(true);
        }
    }
}