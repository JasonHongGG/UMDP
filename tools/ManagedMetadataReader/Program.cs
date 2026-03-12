using System.Text.Json;
using Mono.Cecil;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: ManagedMetadataReader <images|classes|class-details> ... <managed-dir>");
    return 1;
}

var mode = args[0];
var managedDir = args[^1];
if (!Directory.Exists(managedDir))
{
    Console.Error.WriteLine($"Managed directory not found: {managedDir}");
    return 2;
}

var resolver = new DefaultAssemblyResolver();
resolver.AddSearchDirectory(managedDir);

var readerParameters = new ReaderParameters
{
    AssemblyResolver = resolver,
    ReadSymbols = false,
    InMemory = true,
};

object payload;

switch (mode)
{
    case "images":
        payload = new
        {
            images = Directory
                .EnumerateFiles(managedDir, "*.dll", SearchOption.TopDirectoryOnly)
                .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase)
                .Select(path => new
                {
                    id = Path.GetFileName(path),
                    name = Path.GetFileNameWithoutExtension(path),
                    path,
                })
                .ToList(),
        };
        break;

    case "classes":
        if (args.Length < 3)
        {
            Console.Error.WriteLine("Usage: ManagedMetadataReader classes <image-id> <managed-dir>");
            return 3;
        }

        payload = new
        {
            classes = LoadAssembly(args[1], managedDir, readerParameters).MainModule.Types
                .Where(type => !type.IsSpecialName)
                .Select(type => new
                {
                    id = type.FullName,
                    name = type.Name,
                    @namespace = type.Namespace ?? string.Empty,
                    full_name = type.FullName,
                })
                .OrderBy(type => type.full_name, StringComparer.OrdinalIgnoreCase)
                .ToList(),
        };
        break;

    case "class-details":
        if (args.Length < 4)
        {
            Console.Error.WriteLine("Usage: ManagedMetadataReader class-details <image-id> <class-id> <managed-dir>");
            return 4;
        }

        using (var assembly = LoadAssembly(args[1], managedDir, readerParameters))
        {
            var type = assembly.MainModule.Types.FirstOrDefault(item => item.FullName == args[2]);
            if (type is null)
            {
                Console.Error.WriteLine($"Class not found: {args[2]}");
                return 5;
            }

            payload = new
            {
                @class = new
                {
                    id = type.FullName,
                    name = type.Name,
                    @namespace = type.Namespace ?? string.Empty,
                    full_name = type.FullName,
                    inheritance = GetInheritance(type),
                    static_fields = type.Fields
                        .Where(field => field.IsStatic && !field.IsSpecialName)
                        .Select(field => new
                        {
                            name = field.Name,
                            field_type = FormatType(field.FieldType),
                            address = (string?)null,
                            value = (string?)null,
                        })
                        .ToList(),
                    fields = type.Fields
                        .Where(field => !field.IsStatic && !field.IsSpecialName)
                        .Select(field => new
                        {
                            offset = (string?)null,
                            name = field.Name,
                            field_type = FormatType(field.FieldType),
                        })
                        .ToList(),
                    methods = type.Methods
                        .Where(method => !method.IsGetter && !method.IsSetter && !method.IsAddOn && !method.IsRemoveOn)
                        .Select(method => new
                        {
                            name = method.Name,
                            signature = BuildSignature(method),
                        })
                        .ToList(),
                },
            };
        }
        break;

    case "dump-all":
        var images = Directory
            .EnumerateFiles(managedDir, "*.dll", SearchOption.TopDirectoryOnly)
            .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase)
            .Select(path => new
            {
                id = Path.GetFileName(path),
                name = Path.GetFileNameWithoutExtension(path),
                path,
            })
            .ToList();

        var classesByImage = new Dictionary<string, object>();
        var classDetails = new Dictionary<string, object>();

        foreach (var image in images)
        {
            try
            {
                using var assembly = LoadAssembly(image.id, managedDir, readerParameters);
                
                var classSummaries = new List<object>();
                
                foreach (var type in assembly.MainModule.Types.Where(t => !t.IsSpecialName))
                {
                    classSummaries.Add(new
                    {
                        id = type.FullName,
                        name = type.Name,
                        @namespace = type.Namespace ?? string.Empty,
                        full_name = type.FullName,
                    });

                    var cacheKey = $"{image.id}::{type.FullName}";
                    classDetails[cacheKey] = new
                    {
                        id = type.FullName,
                        name = type.Name,
                        @namespace = type.Namespace ?? string.Empty,
                        full_name = type.FullName,
                        inheritance = GetInheritance(type),
                        static_fields = type.Fields
                            .Where(field => field.IsStatic && !field.IsSpecialName)
                            .Select(field => new
                            {
                                name = field.Name,
                                field_type = FormatType(field.FieldType),
                                address = (string?)null,
                                value = (string?)null,
                            })
                            .ToList(),
                        fields = type.Fields
                            .Where(field => !field.IsStatic && !field.IsSpecialName)
                            .Select(field => new
                            {
                                offset = (string?)null,
                                name = field.Name,
                                field_type = FormatType(field.FieldType),
                            })
                            .ToList(),
                        methods = type.Methods
                            .Where(method => !method.IsGetter && !method.IsSetter && !method.IsAddOn && !method.IsRemoveOn)
                            .Select(method => new
                            {
                                name = method.Name,
                                signature = BuildSignature(method),
                            })
                            .ToList(),
                    };
                }

                classesByImage[image.id] = classSummaries.OrderBy(c => (string)((dynamic)c).full_name, StringComparer.OrdinalIgnoreCase).ToList();
            }
            catch
            {
                // Skip failed assemblies so one error doesn't break the entire dump
            }
        }

        payload = new
        {
            images,
            classesByImage,
            classDetails,
        };
        break;

    default:
        Console.Error.WriteLine($"Unknown mode: {mode}");
        return 6;
}

await JsonSerializer.SerializeAsync(Console.OpenStandardOutput(), payload, new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
});

return 0;

static AssemblyDefinition LoadAssembly(string imageId, string managedDir, ReaderParameters readerParameters)
{
    var assemblyPath = Path.Combine(managedDir, imageId);
    if (!File.Exists(assemblyPath))
    {
        throw new FileNotFoundException($"Assembly not found: {assemblyPath}");
    }

    return AssemblyDefinition.ReadAssembly(assemblyPath, readerParameters);
}

static List<object> GetInheritance(TypeDefinition type)
{
    var chain = new List<object>();
    var seen = new HashSet<string>(StringComparer.Ordinal);
    TypeReference? current = type;

    while (current is not null)
    {
        var name = current.FullName.Replace('/', '+');
        if (!seen.Add(name))
        {
            break;
        }

        chain.Add(new { name });

        if (current is TypeDefinition currentDefinition)
        {
            current = currentDefinition.BaseType;
            continue;
        }

        try
        {
            current = current.Resolve()?.BaseType;
        }
        catch
        {
            break;
        }
    }

    return chain;
}

static string BuildSignature(MethodDefinition method)
{
    var parameters = string.Join(", ", method.Parameters.Select(parameter => $"{FormatType(parameter.ParameterType)} {parameter.Name}"));
    return $"{FormatType(method.ReturnType)} ({parameters})";
}

static string FormatType(TypeReference type)
{
    return type.FullName.Replace('/', '+');
}
