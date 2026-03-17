using Cpp2IL.Core;
using Mono.Cecil;

namespace ManagedMetadataReader;

internal sealed class ManagedMetadataCatalog : IDisposable
{
    private readonly MetadataSource _source;
    private readonly ReaderParameters _readerParameters;
    private readonly List<AssemblyDefinition> _il2cppAssemblies = [];

    public ManagedMetadataCatalog(string inputDirectory)
    {
        _source = MetadataSourceResolver.Resolve(inputDirectory);

        var resolver = new DefaultAssemblyResolver();
        if (_source.ManagedDirectory is not null)
        {
            resolver.AddSearchDirectory(_source.ManagedDirectory);
        }

        _readerParameters = new ReaderParameters
        {
            AssemblyResolver = resolver,
            ReadSymbols = false,
            InMemory = true,
        };

        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            var unityVersion = Cpp2IlApi.DetermineUnityVersion(_source.UnityPlayerPath!, _source.DataDirectory)
                ?? throw new InvalidOperationException("Failed to determine Unity version for IL2CPP metadata");
            Cpp2IlApi.InitializeLibCpp2Il(_source.GameAssemblyPath!, _source.GlobalMetadataPath!, unityVersion, false);
            _il2cppAssemblies.AddRange(Cpp2IlApi.MakeDummyDLLs(suppressAttributes: true));
        }
    }

    public List<ImageContract> GetImages()
    {
        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            return _il2cppAssemblies
                .OrderBy(GetImageId, StringComparer.OrdinalIgnoreCase)
                .Select(CreateImageContract)
                .ToList();
        }

        return Directory
            .EnumerateFiles(_source.ManagedDirectory!, "*.dll", SearchOption.TopDirectoryOnly)
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
        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            var generatedAssembly = ResolveGeneratedAssembly(imageId);
            return EnumerateVisibleTypes(generatedAssembly)
                .Select(CreateClassSummary)
                .OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        using var assembly = LoadAssembly(imageId);
        return EnumerateVisibleTypes(assembly)
            .Select(CreateClassSummary)
            .OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public ClassDetailsContract GetClassDetails(string imageId, string classId)
    {
        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            var generatedAssembly = ResolveGeneratedAssembly(imageId);
            var generatedType = generatedAssembly.MainModule.Types.FirstOrDefault(item => item.FullName == classId);
            if (generatedType is null)
            {
                throw new FileNotFoundException($"Class not found: {classId}");
            }

            return CreateClassDetails(generatedType);
        }

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

        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            foreach (var assembly in _il2cppAssemblies.OrderBy(GetImageId, StringComparer.OrdinalIgnoreCase))
            {
                var imageId = GetImageId(assembly);
                var classSummaries = new List<ClassSummaryContract>();

                foreach (var type in EnumerateVisibleTypes(assembly))
                {
                    var summary = CreateClassSummary(type);
                    classSummaries.Add(summary);
                    classDetails[$"{imageId}::{type.FullName}"] = CreateClassDetails(type);
                }

                classesByImage[imageId] = classSummaries
                    .OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }

            return new DumpAllResponseContract
            {
                Images = images,
                ClassesByImage = classesByImage,
                ClassDetails = classDetails,
            };
        }

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
        var assemblyPath = Path.Combine(_source.ManagedDirectory!, imageId);
        if (!File.Exists(assemblyPath))
        {
            throw new FileNotFoundException($"Assembly not found: {assemblyPath}");
        }

        return AssemblyDefinition.ReadAssembly(assemblyPath, _readerParameters);
    }

    public void Dispose()
    {
        foreach (var assembly in _il2cppAssemblies)
        {
            assembly.Dispose();
        }

        if (_source.Kind == MetadataSourceKind.Il2Cpp)
        {
            Cpp2IlApi.DisposeAndCleanupAll();
        }
    }

    private AssemblyDefinition ResolveGeneratedAssembly(string imageId)
    {
        var assembly = _il2cppAssemblies.FirstOrDefault(item =>
            string.Equals(GetImageId(item), imageId, StringComparison.OrdinalIgnoreCase)
            || string.Equals(item.Name.Name, imageId, StringComparison.OrdinalIgnoreCase));

        return assembly ?? throw new FileNotFoundException($"Assembly not found: {imageId}");
    }

    private ImageContract CreateImageContract(AssemblyDefinition assembly)
    {
        var imageId = GetImageId(assembly);
        return new ImageContract
        {
            Id = imageId,
            Name = Path.GetFileNameWithoutExtension(imageId),
            Path = _source.GameAssemblyPath ?? imageId,
        };
    }

    private static string GetImageId(AssemblyDefinition assembly)
    {
        var name = assembly.Name.Name;
        return name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) ? name : $"{name}.dll";
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
                .Select(CreateMethod)
                .OrderBy(GetPrimaryMethodTagRank)
                .ThenBy(method => method.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(method => method.Signature, StringComparer.OrdinalIgnoreCase)
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
            Tags = BuildMethodTags(method),
        };
    }

    private static List<string> BuildMethodTags(MethodDefinition method)
    {
        var tags = new List<string>();

        if (method.IsConstructor)
        {
            tags.Add("CTOR");
        }

        if (method.IsStatic)
        {
            tags.Add("STATIC");
        }

        if (method.IsGetter)
        {
            tags.Add("GETTER");
        }

        if (method.IsSetter)
        {
            tags.Add("SETTER");
        }

        if (method.IsAddOn)
        {
            tags.Add("EVENT_ADD");
        }

        if (method.IsRemoveOn)
        {
            tags.Add("EVENT_REMOVE");
        }

        if (method.IsAbstract)
        {
            tags.Add("ABSTRACT");
        }

        if (method.IsVirtual)
        {
            tags.Add(method.IsReuseSlot ? "VIRTUAL" : "OVERRIDE");
        }

        if (method.HasGenericParameters)
        {
            tags.Add("GENERIC");
        }

        if (method.IsPInvokeImpl || method.IsInternalCall)
        {
            tags.Add("EXTERN");
        }

        if (method.Name.StartsWith("op_", StringComparison.Ordinal))
        {
            tags.Add("OPERATOR");
        }

        if (tags.Count == 0)
        {
            tags.Add("INSTANCE");
        }

        return tags;
    }

    private static int GetPrimaryMethodTagRank(MethodContract method)
    {
        foreach (var tag in method.Tags)
        {
            if (METHOD_TAG_SORT_ORDER.TryGetValue(tag, out var rank))
            {
                return rank;
            }
        }

        return int.MaxValue;
    }

    private static readonly Dictionary<string, int> METHOD_TAG_SORT_ORDER = new(StringComparer.Ordinal)
    {
        ["CTOR"] = 0,
        ["STATIC"] = 1,
        ["GETTER"] = 2,
        ["SETTER"] = 3,
        ["EVENT_ADD"] = 4,
        ["EVENT_REMOVE"] = 5,
        ["OPERATOR"] = 6,
        ["ABSTRACT"] = 7,
        ["OVERRIDE"] = 8,
        ["VIRTUAL"] = 9,
        ["EXTERN"] = 10,
        ["GENERIC"] = 11,
        ["INSTANCE"] = 12,
    };

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