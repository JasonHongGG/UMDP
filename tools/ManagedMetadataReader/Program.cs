using System.Text.Json;

using ManagedMetadataReader;

return await ProgramEntry.RunAsync(args);

namespace ManagedMetadataReader
{
internal static class ProgramEntry
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            var command = CommandLineParser.Parse(args);
            var catalog = new ManagedMetadataCatalog(command.ManagedDirectory);
            object payload = command.Mode switch
            {
                ReaderMode.Images => new ImagesResponse { Images = catalog.GetImages() },
                ReaderMode.Classes => new ClassesResponse { Classes = catalog.GetClasses(command.ImageId!) },
                ReaderMode.ClassDetails => new ClassDetailsResponse { Class = catalog.GetClassDetails(command.ImageId!, command.ClassId!) },
                ReaderMode.DumpAll => catalog.DumpAll(),
                _ => throw new CommandLineException(6, $"Unknown mode: {command.Mode}"),
            };

            await JsonSerializer.SerializeAsync(Console.OpenStandardOutput(), payload, JsonOptions);
            return 0;
        }
        catch (CommandLineException error)
        {
            Console.Error.WriteLine(error.Message);
            return error.ExitCode;
        }
        catch (FileNotFoundException error)
        {
            Console.Error.WriteLine(error.Message);
            return 5;
        }
    }
}
}
