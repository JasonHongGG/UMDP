#include "../include/RuntimeBridge.h"

#include <Windows.h>

#include <algorithm>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "../../../reference/UnityMonoAPI/API/MonoAPI.h"

namespace {

using MonoClassPtr = std::unique_ptr<MonoClass>;
using RuntimeHierarchy = std::vector<MonoClassPtr>;

std::string HexAddress(DWORD_PTR address)
{
    std::ostringstream stream;
    stream << std::hex << std::nouppercase << address;
    return stream.str();
}

std::string HexOffset(int offset)
{
    std::ostringstream stream;
    stream << std::hex << std::uppercase << std::setw(3) << std::setfill('0') << offset;
    return stream.str();
}

bool SupportsDirectStaticRead(const std::string& type_name)
{
    return type_name == "System.Boolean"
        || type_name == "System.Byte"
        || type_name == "System.SByte"
        || type_name == "System.Int16"
        || type_name == "System.UInt16"
        || type_name == "System.Int32"
        || type_name == "System.UInt32"
        || type_name == "System.Int64"
        || type_name == "System.UInt64"
        || type_name == "System.Single"
        || type_name == "System.Double";
}

bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty() || field_name.starts_with("<");
}

std::optional<std::string> ReadStaticValue(MonoField& field, DWORD_PTR address)
{
    const std::string type_name = field.GetTypeName();

    if (address == 0) {
        return std::nullopt;
    }

    if (type_name == "System.Boolean") {
        return MonoUtils.ReadValue<bool>(FieldTypeNameMap[GetReadType(type_name)], address) ? "true" : "false";
    }
    if (type_name == "System.Byte") {
        return std::to_string(static_cast<unsigned int>(MonoUtils.ReadValue<unsigned char>(FieldTypeNameMap[GetReadType(type_name)], address)));
    }
    if (type_name == "System.SByte") {
        return std::to_string(static_cast<int>(MonoUtils.ReadValue<char>(FieldTypeNameMap[GetReadType(type_name)], address)));
    }
    if (type_name == "System.Int16") {
        return std::to_string(MonoUtils.ReadValue<short>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.UInt16") {
        return std::to_string(MonoUtils.ReadValue<unsigned short>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.Int32") {
        return std::to_string(MonoUtils.ReadValue<int>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.UInt32") {
        return std::to_string(MonoUtils.ReadValue<unsigned int>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.Int64") {
        return std::to_string(MonoUtils.ReadValue<long long>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.UInt64") {
        return std::to_string(MonoUtils.ReadValue<unsigned long long>(FieldTypeNameMap[GetReadType(type_name)], address));
    }
    if (type_name == "System.Single") {
        std::ostringstream stream;
        stream << MonoUtils.ReadValue<float>(FieldTypeNameMap[GetReadType(type_name)], address);
        return stream.str();
    }
    if (type_name == "System.Double") {
        std::ostringstream stream;
        stream << MonoUtils.ReadValue<double>(FieldTypeNameMap[GetReadType(type_name)], address);
        return stream.str();
    }

    DWORD_PTR pointer_value = 0;
    MemMgr.MemReader.ReadMem(pointer_value, address);
    if (pointer_value == 0) {
        return std::nullopt;
    }

    return HexAddress(pointer_value);
}

void AttachByPid(std::size_t pid)
{
    ProcessInfo::PID = pid;
    ProcMgr.InfoMgr.GetProcessNameByPID(pid);
    if (ProcessInfo::ProcessName.empty()) {
        throw std::runtime_error("process name not found");
    }

    if (ProcessInfo::hProcess != nullptr) {
        CloseHandle(ProcessInfo::hProcess);
        ProcessInfo::hProcess = nullptr;
    }

    ProcessInfo::hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, static_cast<DWORD>(pid));
    if (ProcessInfo::hProcess == nullptr) {
        throw std::runtime_error("failed to open process");
    }

    ProcMgr.InfoMgr.ProcessIs64Bit();
    const std::wstring process_name = Utils.UTF8ToUnicode(ProcessInfo::ProcessName.c_str());
    ProcMgr.ModuleMgr.GetModule(pid, process_name.c_str());
    IsIL2CPP = false;
    MonoMgr.Init();

    if (MonoMgr.hMonoModule == nullptr) {
        throw std::runtime_error("mono runtime module not found");
    }

    if (IsIL2CPP) {
        throw std::runtime_error("IL2CPP runtime is not supported by this bridge yet");
    }
}

MonoImage* ResolveImage(const std::string& image_name)
{
    MonoImage* image = MonoMgr.ImageAPI->FindImageByName(image_name);
    if (image == nullptr && image_name.ends_with(".dll")) {
        image = MonoMgr.ImageAPI->FindImageByName(image_name.substr(0, image_name.size() - 4));
    }

    if (image == nullptr) {
        throw std::runtime_error("image not found");
    }

    return image;
}

MonoClass* ResolveClass(MonoImage* image, const bridge::BridgeRequest& request)
{
    std::string lookup_name = request.class_name;
    if (!request.class_namespace.empty()) {
        lookup_name = request.class_namespace + "." + request.class_name;
    }

    MonoClass* klass = MonoMgr.ClassAPI->GetClassByImage(image, image->Name, lookup_name);
    if (klass == nullptr) {
        throw std::runtime_error("class not found");
    }

    return klass;
}

RuntimeHierarchy BuildClassHierarchy(MonoClass* klass)
{
    RuntimeHierarchy hierarchy;
    DWORD_PTR current_handle = klass->Handle;

    while (current_handle != 0) {
        hierarchy.push_back(std::make_unique<MonoClass>(MonoMgr.ClassAPI, klass->Image, current_handle, "", ""));
        current_handle = MonoMgr.FunctSet.FunctPtrSet["mono_class_get_parent"]->Call<DWORD_PTR>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, current_handle);
        current_handle &= 0xFFFFFFFFFFFF;
    }

    std::reverse(hierarchy.begin(), hierarchy.end());
    return hierarchy;
}

class RuntimeFieldCollector {
public:
    std::vector<bridge::FieldRow> CollectStaticFields(const RuntimeHierarchy& hierarchy) const
    {
        return Collect(hierarchy, FieldSelection::Static);
    }

    std::vector<bridge::FieldRow> CollectInstanceFields(const RuntimeHierarchy& hierarchy) const
    {
        return Collect(hierarchy, FieldSelection::Instance);
    }

private:
    enum class FieldSelection {
        Static,
        Instance,
    };

    std::vector<bridge::FieldRow> Collect(const RuntimeHierarchy& hierarchy, FieldSelection selection) const
    {
        std::vector<bridge::FieldRow> fields;
        for (const auto& klass : hierarchy) {
            AppendClassFields(*klass, selection, fields);
        }

        return fields;
    }

    void AppendClassFields(MonoClass& klass, FieldSelection selection, std::vector<bridge::FieldRow>& fields) const
    {
        CValue<DWORD_PTR> iterator_state(0);
        while (true) {
            DWORD_PTR field_handle = MonoMgr.FunctSet.FunctPtrSet["mono_class_get_fields"]->Call<DWORD_PTR>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, klass.Handle, iterator_state.Address);
            field_handle &= 0xFFFFFFFFFFFF;
            if (field_handle == 0) {
                break;
            }

            const std::string field_name = MonoMgr.FunctSet.FunctPtrSet["mono_field_get_name"]->Call<std::string>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, field_handle);
            if (ShouldSkipField(field_name)) {
                continue;
            }

            MonoField field(&klass, field_handle, field_name);
            if (!MatchesSelection(field, selection)) {
                continue;
            }

            fields.push_back(BuildRow(klass, field, selection));
        }
    }

    static bool MatchesSelection(MonoField& field, FieldSelection selection)
    {
        const bool is_static = field.IsStatic(&field);
        return selection == FieldSelection::Static ? is_static : !is_static;
    }

    static bridge::FieldRow BuildRow(MonoClass& klass, MonoField& field, FieldSelection selection)
    {
        const std::string field_type = field.GetTypeName();
        if (selection == FieldSelection::Static) {
            const bool readable = SupportsDirectStaticRead(field_type);
            const DWORD_PTR address = readable ? klass.ClassAPI->GetStaticFieldAddress(&klass, &field) : 0;
            return bridge::FieldRow{
                field.Name,
                field_type,
                address == 0 ? std::nullopt : std::optional<std::string>(HexAddress(address)),
                readable ? ReadStaticValue(field, address) : std::nullopt,
                std::nullopt,
            };
        }

        return bridge::FieldRow{
            field.Name,
            field_type,
            std::nullopt,
            std::nullopt,
            std::optional<std::string>(HexOffset(field.GetOffset())),
        };
    }
};

} // namespace

namespace bridge {

BridgeRequest ArgumentParser::Parse(int argc, char* argv[])
{
    BridgeRequest request;
    for (int index = 1; index + 1 < argc; index += 2) {
        const std::string key = argv[index];
        const std::string value = argv[index + 1];
        if (key == "--pid") {
            request.pid = static_cast<std::size_t>(std::stoull(value));
        }
        else if (key == "--image") {
            request.image_name = value;
        }
        else if (key == "--namespace") {
            request.class_namespace = value;
        }
        else if (key == "--class") {
            request.class_name = value;
        }
    }

    if (request.pid == 0 || request.image_name.empty() || request.class_name.empty()) {
        throw std::runtime_error("Missing required arguments");
    }

    return request;
}

RuntimeClassOverlayResponse RuntimeBridge::Execute(const BridgeRequest& request) const
{
    AttachByPid(request.pid);

    MonoImage* image = ResolveImage(request.image_name);
    MonoClass* klass = ResolveClass(image, request);
    const auto hierarchy = BuildClassHierarchy(klass);

    RuntimeFieldCollector collector;
    return RuntimeClassOverlayResponse{
        collector.CollectStaticFields(hierarchy),
        collector.CollectInstanceFields(hierarchy),
    };
}

} // namespace bridge