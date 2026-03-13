namespace ManagedMetadataReader;

internal enum MetadataSourceKind
{
    Mono,
    Il2Cpp,
}

internal sealed record MetadataSource(
    MetadataSourceKind Kind,
    string InputDirectory,
    string DataDirectory,
    string? ManagedDirectory = null,
    string? GameAssemblyPath = null,
    string? GlobalMetadataPath = null,
    string? UnityPlayerPath = null);

internal static class MetadataSourceResolver
{
    public static MetadataSource Resolve(string inputDirectory)
    {
        var normalizedInput = Path.GetFullPath(inputDirectory);
        var inputName = Path.GetFileName(normalizedInput.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        var candidateDataDirectory = string.Equals(inputName, "Managed", StringComparison.OrdinalIgnoreCase)
            ? Directory.GetParent(normalizedInput)?.FullName
            : normalizedInput;

        if (!string.IsNullOrEmpty(candidateDataDirectory))
        {
            var globalMetadataPath = Path.Combine(candidateDataDirectory, "il2cpp_data", "Metadata", "global-metadata.dat");
            var gameRoot = Directory.GetParent(candidateDataDirectory)?.FullName;
            var gameAssemblyPath = string.IsNullOrEmpty(gameRoot) ? null : Path.Combine(gameRoot, "GameAssembly.dll");
            if (!string.IsNullOrEmpty(gameAssemblyPath) && File.Exists(gameAssemblyPath) && File.Exists(globalMetadataPath))
            {
                return new MetadataSource(
                    MetadataSourceKind.Il2Cpp,
                    normalizedInput,
                    candidateDataDirectory,
                    ManagedDirectory: ResolveManagedDirectory(candidateDataDirectory),
                    GameAssemblyPath: gameAssemblyPath,
                    GlobalMetadataPath: globalMetadataPath,
                    UnityPlayerPath: ResolveUnityPlayerPath(gameRoot!));
            }
        }

        var managedDirectory = ResolveManagedDirectory(normalizedInput)
            ?? (!string.IsNullOrEmpty(candidateDataDirectory) ? ResolveManagedDirectory(candidateDataDirectory) : null);

        if (managedDirectory is not null)
        {
            return new MetadataSource(MetadataSourceKind.Mono, normalizedInput, candidateDataDirectory ?? normalizedInput, ManagedDirectory: managedDirectory);
        }

        throw new FileNotFoundException($"Could not locate Mono managed assemblies or IL2CPP metadata under: {normalizedInput}");
    }

    private static string? ResolveManagedDirectory(string directory)
    {
        if (!Directory.Exists(directory))
        {
            return null;
        }

        if (Directory.EnumerateFiles(directory, "*.dll", SearchOption.TopDirectoryOnly).Any())
        {
            return directory;
        }

        var managedDirectory = Path.Combine(directory, "Managed");
        return Directory.Exists(managedDirectory) ? managedDirectory : null;
    }

    private static string ResolveUnityPlayerPath(string gameRoot)
    {
        var unityPlayer = Path.Combine(gameRoot, "UnityPlayer.dll");
        if (File.Exists(unityPlayer))
        {
            return unityPlayer;
        }

        var executable = Directory.EnumerateFiles(gameRoot, "*.exe", SearchOption.TopDirectoryOnly).FirstOrDefault();
        if (executable is not null)
        {
            return executable;
        }

        throw new FileNotFoundException($"UnityPlayer.dll or game executable not found under: {gameRoot}");
    }
}