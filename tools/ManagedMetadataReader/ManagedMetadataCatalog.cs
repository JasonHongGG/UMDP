using Mono.Cecil;

namespace ManagedMetadataReader;

internal sealed class ManagedMetadataCatalog
{
    private readonly string _managedDirectory;
    private readonly ReaderParameters _readerParameters;

    public ManagedMetadataCatalog(string managedDirectory)
    {
        _managedDirectory = managedDirectory;

        var resolver = new DefaultAssemblyResolver();
        resolver.AddSearchDirectory(managedDirectory);

        _readerParameters = new ReaderParameters
        {
            AssemblyResolver = resolver,
            ReadSymbols = false,
            InMemory = true,
        };
    }

    public List<ImageContract> GetImages()
    {
        return Directory
            .EnumerateFiles(_managedDirectory, "*.dll", SearchOption.TopDirectoryOnly)
            .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
            .Select(path => new ImageContract
            {
                Id = Path.GetFileName(path),
                Name = Path.GetFileNameWithoutExtension(path),
                Path = path,
            })
            .ToList();
    }

    public List<ClassSummaryContract> GetClasses(string imageId)
    {
        using var assembly = LoadAssembly(imageId);
        return EnumerateVisibleTypes(assembly)
            .Select(CreateClassSummary)
            .OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public ClassDetailsContract GetClassDetails(string imageId, string classId)
    {
        using var assembly = LoadAssembly(imageId);
        var type = assembly.MainModule.Types.FirstOrDefault(item => item.FullName == classId);
        if (type is null)
        {
            throw new FileNotFoundException($"Class not found: {classId}");
        }

        return CreateClassDetails(type);
    }

    public DumpAllResponseContract DumpAll()
    {
        var images = GetImages();
        var classesByImage = new Dictionary<string, List<ClassSummaryContract>>(StringComparer.Ordinal);
        var classDetails = new Dictionary<string, ClassDetailsContract>(StringComparer.Ordinal);

        foreach (var image in images)
        {
            try
            {
                using var assembly = LoadAssembly(image.Id);
                var classSummaries = new List<ClassSummaryContract>();

                foreach (var type in EnumerateVisibleTypes(assembly))
                {
                    var summary = CreateClassSummary(type);
                    classSummaries.Add(summary);
                    classDetails[$"{image.Id}::{type.FullName}"] = CreateClassDetails(type);
                }

                classesByImage[image.Id] = classSummaries
                    .OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
            catch
            {
                // Skip failed assemblies so one error doesn't break the entire dump.
            }
        }

        return new DumpAllResponseContract
        {
            Images = images,
            ClassesByImage = classesByImage,
            ClassDetails = classDetails,
        };
    }

    private AssemblyDefinition LoadAssembly(string imageId)
    {
        var assemblyPath = Path.Combine(_managedDirectory, imageId);
        if (!File.Exists(assemblyPath))
        {
            throw new FileNotFoundException($"Assembly not found: {assemblyPath}");
        }

        return AssemblyDefinition.ReadAssembly(assemblyPath, _readerParameters);
    }

    private static IEnumerable<TypeDefinition> EnumerateVisibleTypes(AssemblyDefinition assembly)
    {
        return assembly.MainModule.Types.Where(type => !type.IsSpecialName);
    }

    private static ClassSummaryContract CreateClassSummary(TypeDefinition type)
    {
        return new ClassSummaryContract
        {
            Id = type.FullName,
            Name = type.Name,
            Namespace = type.Namespace ?? string.Empty,
            FullName = type.FullName,
        };
    }

    private static ClassDetailsContract CreateClassDetails(TypeDefinition type)
    {
        var summary = CreateClassSummary(type);
        return new ClassDetailsContract
        {
            Id = summary.Id,
            Name = summary.Name,
            Namespace = summary.Namespace,
            FullName = summary.FullName,
            Inheritance = GetInheritanceChain(type),
            StaticFields = type.Fields
                .Where(field => field.IsStatic && !field.IsSpecialName)
                .Select(CreateStaticField)
                .ToList(),
            Fields = type.Fields
                .Where(field => !field.IsStatic && !field.IsSpecialName)
                .Select(CreateInstanceField)
                .ToList(),
            Methods = type.Methods
                .Where(method => !method.IsGetter && !method.IsSetter && !method.IsAddOn && !method.IsRemoveOn)
                .Select(CreateMethod)
                .ToList(),
        };
    }

    private static List<InheritanceNodeContract> GetInheritanceChain(TypeDefinition type)
    {
        var chain = new List<InheritanceNodeContract>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        TypeReference? current = type;

        while (current is not null)
        {
            var normalizedName = FormatType(current);
            if (!seen.Add(normalizedName))
            {
                break;
            }

            chain.Add(new InheritanceNodeContract { Name = normalizedName });

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

    private static StaticFieldContract CreateStaticField(FieldDefinition field)
    {
        return new StaticFieldContract
        {
            Name = field.Name,
            FieldType = FormatType(field.FieldType),
            Address = null,
            Value = null,
        };
    }

    private static FieldContract CreateInstanceField(FieldDefinition field)
    {
        return new FieldContract
        {
            Offset = null,
            Name = field.Name,
            FieldType = FormatType(field.FieldType),
        };
    }

    private static MethodContract CreateMethod(MethodDefinition method)
    {
        return new MethodContract
        {
            Name = method.Name,
            Signature = BuildSignature(method),
        };
    }

    private static string BuildSignature(MethodDefinition method)
    {
        var parameters = string.Join(", ", method.Parameters.Select(parameter => $"{FormatType(parameter.ParameterType)} {parameter.Name}"));
        return $"{FormatType(method.ReturnType)} ({parameters})";
    }

    private static string FormatType(TypeReference type)
    {
        return type.FullName.Replace('/', '+');
    }
}