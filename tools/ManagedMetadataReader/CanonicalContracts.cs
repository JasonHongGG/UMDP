namespace ManagedMetadataReader;

internal sealed class CanonicalAnalysisSnapshot
{
    public int SchemaVersion { get; init; } = 1;
    public string GeneratedAt { get; init; } = string.Empty;
    public object? Process { get; init; }
    public List<CanonicalImageDescriptor> Images { get; init; } = [];
    public Dictionary<string, CanonicalClassDescriptor> Classes { get; init; } = new(StringComparer.Ordinal);
    public Dictionary<string, List<string>> ImageClassIndex { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class CanonicalImageDescriptor
{
    public string StableId { get; init; } = string.Empty;
    public string LegacyImageId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Path { get; init; } = string.Empty;
}

internal class CanonicalFieldDescriptor
{
    public string StableId { get; init; } = string.Empty;
    public string LegacyFieldName { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string FieldType { get; init; } = string.Empty;
    public string? Offset { get; init; }
}

internal sealed class CanonicalStaticFieldDescriptor : CanonicalFieldDescriptor
{
    public string? Address { get; init; }
    public string? Value { get; init; }
}

internal sealed class CanonicalMethodDescriptor
{
    public string StableId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Signature { get; init; } = string.Empty;
    public string ReturnType { get; init; } = string.Empty;
    public List<CanonicalMethodParameterDescriptor> Parameters { get; init; } = [];
    public bool IsStatic { get; init; }
    public List<string> Tags { get; init; } = [];
}

internal sealed class CanonicalMethodParameterDescriptor
{
    public int Position { get; init; }
    public string Name { get; init; } = string.Empty;
    public string TypeName { get; init; } = string.Empty;
}

internal sealed class CanonicalClassDescriptor
{
    public string StableId { get; init; } = string.Empty;
    public string LegacyClassId { get; init; } = string.Empty;
    public string LegacyImageId { get; init; } = string.Empty;
    public string ImageStableId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Namespace { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public List<InheritanceNodeContract> Inheritance { get; init; } = [];
    public List<CanonicalFieldDescriptor> Fields { get; init; } = [];
    public List<CanonicalStaticFieldDescriptor> StaticFields { get; init; } = [];
    public List<CanonicalMethodDescriptor> Methods { get; init; } = [];
}

internal static class CanonicalIdFactory
{
    public static string CreateStableId(string kind, params string[] parts)
    {
        var normalized = parts.Select(NormalizeSegment);
        return $"{kind}:{string.Join("|", normalized)}";
    }

    public static string CreateImageStableId(string imageName, string imagePath)
    {
        return CreateStableId("image", imageName, imagePath);
    }

    public static string CreateClassStableId(string imageStableId, string @namespace, string className, string? legacyClassId)
    {
        return CreateStableId("class", imageStableId, @namespace, className, legacyClassId ?? string.Empty);
    }

    public static string CreateFieldStableId(string classStableId, string fieldName, string fieldType, string fieldKind)
    {
        return CreateStableId("field", classStableId, fieldKind, fieldName, fieldType);
    }

    public static string CreateMethodStableId(string classStableId, string methodName, string signature)
    {
        return CreateStableId("method", classStableId, methodName, signature);
    }

    private static string NormalizeSegment(string segment)
    {
        return segment.Trim().Replace('|', '_').Replace('\\', '_');
    }
}