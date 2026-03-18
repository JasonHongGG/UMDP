namespace ManagedMetadataReader;

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
    public List<string> Tags { get; init; } = [];
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