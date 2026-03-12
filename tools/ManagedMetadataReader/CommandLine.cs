namespace ManagedMetadataReader;

internal enum ReaderMode
{
    Images,
    Classes,
    ClassDetails,
    DumpAll,
}

internal sealed record ReaderCommand(
    ReaderMode Mode,
    string ManagedDirectory,
    string? ImageId = null,
    string? ClassId = null);

internal sealed class CommandLineException : Exception
{
    public CommandLineException(int exitCode, string message) : base(message)
    {
        ExitCode = exitCode;
    }

    public int ExitCode { get; }
}

internal static class CommandLineParser
{
    public static ReaderCommand Parse(string[] args)
    {
        if (args.Length < 2)
        {
            throw new CommandLineException(1, "Usage: ManagedMetadataReader <images|classes|class-details|dump-all> ... <managed-dir>");
        }

        var managedDirectory = args[^1];
        if (!Directory.Exists(managedDirectory))
        {
            throw new CommandLineException(2, $"Managed directory not found: {managedDirectory}");
        }

        return args[0] switch
        {
            "images" => new ReaderCommand(ReaderMode.Images, managedDirectory),
            "classes" when args.Length >= 3 => new ReaderCommand(ReaderMode.Classes, managedDirectory, ImageId: args[1]),
            "classes" => throw new CommandLineException(3, "Usage: ManagedMetadataReader classes <image-id> <managed-dir>"),
            "class-details" when args.Length >= 4 => new ReaderCommand(ReaderMode.ClassDetails, managedDirectory, ImageId: args[1], ClassId: args[2]),
            "class-details" => throw new CommandLineException(4, "Usage: ManagedMetadataReader class-details <image-id> <class-id> <managed-dir>"),
            "dump-all" => new ReaderCommand(ReaderMode.DumpAll, managedDirectory),
            var mode => throw new CommandLineException(6, $"Unknown mode: {mode}"),
        };
    }
}