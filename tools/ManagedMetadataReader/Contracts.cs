using System.Text.Json.Serialization;

namespace ManagedMetadataReader;

internal sealed class ImagesResponse
{
    [JsonPropertyName("images")]
    public List<ImageContract> Images { get; init; } = [];
}

internal sealed class ClassesResponse
{
    [JsonPropertyName("classes")]
    public List<ClassSummaryContract> Classes { get; init; } = [];
}

internal sealed class ClassDetailsResponse
{
    [JsonPropertyName("class")]
    public ClassDetailsContract Class { get; init; } = new();
}

internal sealed class DumpAllResponseContract
{
    [JsonPropertyName("images")]
    public List<ImageContract> Images { get; init; } = [];

    [JsonPropertyName("classesByImage")]
    public Dictionary<string, List<ClassSummaryContract>> ClassesByImage { get; init; } = new(StringComparer.Ordinal);

    [JsonPropertyName("classDetails")]
    public Dictionary<string, ClassDetailsContract> ClassDetails { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class ImageContract
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("path")]
    public string Path { get; init; } = string.Empty;
}

internal class ClassSummaryContract
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("namespace")]
    public string Namespace { get; init; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; init; } = string.Empty;
}

internal sealed class ClassDetailsContract : ClassSummaryContract
{
    [JsonPropertyName("inheritance")]
    public List<InheritanceNodeContract> Inheritance { get; init; } = [];

    [JsonPropertyName("static_fields")]
    public List<StaticFieldContract> StaticFields { get; init; } = [];

    [JsonPropertyName("fields")]
    public List<FieldContract> Fields { get; init; } = [];

    [JsonPropertyName("methods")]
    public List<MethodContract> Methods { get; init; } = [];
}

internal sealed class InheritanceNodeContract
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;
}

internal class FieldContract
{
    [JsonPropertyName("offset")]
    public string? Offset { get; init; }

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("field_type")]
    public string FieldType { get; init; } = string.Empty;
}

internal sealed class StaticFieldContract : FieldContract
{
    [JsonPropertyName("address")]
    public string? Address { get; init; }

    [JsonPropertyName("value")]
    public string? Value { get; init; }
}

internal sealed class MethodContract
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("signature")]
    public string Signature { get; init; } = string.Empty;

    [JsonPropertyName("return_type")]
    public string ReturnType { get; init; } = string.Empty;

    [JsonPropertyName("parameters")]
    public List<MethodParameterContract> Parameters { get; init; } = [];

    [JsonPropertyName("is_static")]
    public bool IsStatic { get; init; }

    [JsonPropertyName("tags")]
    public List<string> Tags { get; init; } = [];
}

internal sealed class MethodParameterContract
{
    [JsonPropertyName("position")]
    public int Position { get; init; }

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("type_name")]
    public string TypeName { get; init; } = string.Empty;
}