#include <algorithm>
#include <Windows.h>
#include <iomanip>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <vector>
#include "../../reference/UnityMonoAPI/API/MonoAPI.h"

struct BridgeRequest {
    size_t pid = 0;
    std::string image_name;
    std::string class_namespace;
    std::string class_name;
};

struct FieldRow {
    std::string name;
    std::string field_type;
    std::optional<std::string> address;
    std::optional<std::string> value;
    std::optional<std::string> offset;
};

static std::string JsonEscape(const std::string& value)
{
    std::ostringstream stream;
    for (const char ch : value) {
        switch (ch) {
        case '\\': stream << "\\\\"; break;
        case '"': stream << "\\\""; break;
        case '\n': stream << "\\n"; break;
        case '\r': stream << "\\r"; break;
        case '\t': stream << "\\t"; break;
        default:
            if (static_cast<unsigned char>(ch) < 0x20 || static_cast<unsigned char>(ch) >= 0x7F) {
                stream << "\\u"
                       << std::hex << std::setw(4) << std::setfill('0')
                       << static_cast<int>(static_cast<unsigned char>(ch))
                       << std::dec;
            }
            else {
                stream << ch;
            }
            break;
        }
    }
    return stream.str();
}

static std::string HexAddress(DWORD_PTR address)
{
    std::ostringstream stream;
    stream << std::hex << std::nouppercase << address;
    return stream.str();
}

static std::string HexOffset(int offset)
{
    std::ostringstream stream;
    stream << std::hex << std::uppercase << std::setw(3) << std::setfill('0') << offset;
    return stream.str();
}

static bool AttachByPid(size_t pid, std::string& error)
{
    ProcessInfo::PID = pid;
    ProcMgr.InfoMgr.GetProcessNameByPID(pid);
    if (ProcessInfo::ProcessName.empty()) {
        error = "process name not found";
        return false;
    }

    if (ProcessInfo::hProcess != nullptr) {
        CloseHandle(ProcessInfo::hProcess);
        ProcessInfo::hProcess = nullptr;
    }

    ProcessInfo::hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, static_cast<DWORD>(pid));
    if (ProcessInfo::hProcess == nullptr) {
        error = "failed to open process";
        return false;
    }

    ProcMgr.InfoMgr.ProcessIs64Bit();
    const std::wstring process_name = Utils.UTF8ToUnicode(ProcessInfo::ProcessName.c_str());
    ProcMgr.ModuleMgr.GetModule(pid, process_name.c_str());
    IsIL2CPP = false;
    MonoMgr.Init();

    if (MonoMgr.hMonoModule == nullptr) {
        error = "mono runtime module not found";
        return false;
    }

    if (IsIL2CPP) {
        error = "IL2CPP runtime is not supported by this bridge yet";
        return false;
    }

    return true;
}

static BridgeRequest ParseArgs(int argc, char* argv[])
{
    BridgeRequest request;
    for (int index = 1; index + 1 < argc; index += 2) {
        const std::string key = argv[index];
        const std::string value = argv[index + 1];
        if (key == "--pid") {
            request.pid = static_cast<size_t>(std::stoull(value));
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
    return request;
}

static std::optional<std::string> ReadStaticValue(MonoField& field, DWORD_PTR address)
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

static bool SupportsDirectStaticRead(const std::string& type_name)
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

static bool ShouldSkipField(const std::string& field_name)
{
    return field_name.empty() || field_name.starts_with("<");
}

static MonoClass* CreateRuntimeClass(DWORD_PTR class_handle, MonoImage* fallback_image)
{
    return new MonoClass(MonoMgr.ClassAPI, fallback_image, class_handle, "", "");
}

static std::vector<MonoClass*> BuildClassHierarchy(MonoClass* klass)
{
    std::vector<MonoClass*> hierarchy;
    DWORD_PTR current_handle = klass->Handle;
    while (current_handle != 0) {
        hierarchy.push_back(CreateRuntimeClass(current_handle, klass->Image));
        current_handle = MonoMgr.FunctSet.FunctPtrSet["mono_class_get_parent"]->Call<DWORD_PTR>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, current_handle);
        current_handle &= 0xFFFFFFFFFFFF;
    }

    std::reverse(hierarchy.begin(), hierarchy.end());
    return hierarchy;
}

static std::vector<FieldRow> CollectStaticFields(const std::vector<MonoClass*>& hierarchy)
{
    std::vector<FieldRow> fields;
    for (MonoClass* klass : hierarchy) {
        CValue<DWORD_PTR> iterator_state(0);
        while (true) {
            DWORD_PTR field_handle = MonoMgr.FunctSet.FunctPtrSet["mono_class_get_fields"]->Call<DWORD_PTR>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, klass->Handle, iterator_state.Address);
            field_handle &= 0xFFFFFFFFFFFF;
            if (field_handle == 0) {
                break;
            }

            const std::string field_name = MonoMgr.FunctSet.FunctPtrSet["mono_field_get_name"]->Call<std::string>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, field_handle);
            if (ShouldSkipField(field_name)) {
                continue;
            }

            MonoField field(klass, field_handle, field_name);
            if (!field.IsStatic(&field)) {
                continue;
            }

            const std::string field_type = field.GetTypeName();
            const bool readable = SupportsDirectStaticRead(field_type);
            const DWORD_PTR address = readable ? klass->ClassAPI->GetStaticFieldAddress(klass, &field) : 0;
            fields.push_back(FieldRow {
                field_name,
                field_type,
                address == 0 ? std::nullopt : std::optional<std::string>(HexAddress(address)),
                readable ? ReadStaticValue(field, address) : std::nullopt,
                std::nullopt,
            });
        }
    }

    return fields;
}

static std::vector<FieldRow> CollectInstanceFields(const std::vector<MonoClass*>& hierarchy)
{
    std::vector<FieldRow> fields;
    for (MonoClass* klass : hierarchy) {
        CValue<DWORD_PTR> iterator_state(0);
        while (true) {
            DWORD_PTR field_handle = MonoMgr.FunctSet.FunctPtrSet["mono_class_get_fields"]->Call<DWORD_PTR>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, klass->Handle, iterator_state.Address);
            field_handle &= 0xFFFFFFFFFFFF;
            if (field_handle == 0) {
                break;
            }

            const std::string field_name = MonoMgr.FunctSet.FunctPtrSet["mono_field_get_name"]->Call<std::string>(CALL_TYPE_CDECL, MonoMgr.ThreadFunctionList, field_handle);
            if (ShouldSkipField(field_name)) {
                continue;
            }

            MonoField field(klass, field_handle, field_name);
            if (field.IsStatic(&field)) {
                continue;
            }

            fields.push_back(FieldRow {
                field_name,
                field.GetTypeName(),
                std::nullopt,
                std::nullopt,
                std::optional<std::string>(HexOffset(field.GetOffset())),
            });
        }
    }

    return fields;
}

static void WriteFieldRows(std::ostringstream& output, const std::vector<FieldRow>& rows, bool include_runtime_values)
{
    for (size_t index = 0; index < rows.size(); ++index) {
        if (index > 0) {
            output << ",";
        }

        const FieldRow& row = rows[index];
        output << "{"
               << "\"name\":\"" << JsonEscape(row.name) << "\"," 
               << "\"field_type\":\"" << JsonEscape(row.field_type) << "\"";

        if (include_runtime_values) {
            output << ",\"address\":";
            if (row.address.has_value()) {
                output << "\"" << JsonEscape(*row.address) << "\"";
            }
            else {
                output << "null";
            }

            output << ",\"value\":";
            if (row.value.has_value()) {
                output << "\"" << JsonEscape(*row.value) << "\"";
            }
            else {
                output << "null";
            }
        }
        else {
            output << ",\"offset\":";
            if (row.offset.has_value()) {
                output << "\"" << JsonEscape(*row.offset) << "\"";
            }
            else {
                output << "null";
            }
        }

        output << "}";
    }
}

int main(int argc, char* argv[])
{
    try {
        const BridgeRequest request = ParseArgs(argc, argv);
        if (request.pid == 0 || request.image_name.empty() || request.class_name.empty()) {
            std::cerr << "Missing required arguments";
            return 2;
        }

        std::string error;
        if (!AttachByPid(request.pid, error)) {
            std::cerr << error;
            return 3;
        }

        MonoImage* image = MonoMgr.ImageAPI->FindImageByName(request.image_name);
        if (image == nullptr && request.image_name.ends_with(".dll")) {
            image = MonoMgr.ImageAPI->FindImageByName(request.image_name.substr(0, request.image_name.size() - 4));
        }
        if (image == nullptr) {
            std::cerr << "image not found";
            return 4;
        }

        std::string lookup_name = request.class_name;
        if (!request.class_namespace.empty()) {
            lookup_name = request.class_namespace + "." + request.class_name;
        }

        MonoClass* klass = MonoMgr.ClassAPI->GetClassByImage(image, image->Name, lookup_name);
        if (klass == nullptr) {
            std::cerr << "class not found";
            return 5;
        }

        const std::vector<MonoClass*> hierarchy = BuildClassHierarchy(klass);
        const std::vector<FieldRow> static_fields = CollectStaticFields(hierarchy);
        const std::vector<FieldRow> instance_fields = CollectInstanceFields(hierarchy);

        std::ostringstream output;
        output << "{\"static_fields\":[";
        WriteFieldRows(output, static_fields, true);
        output << "],\"fields\":[";
        WriteFieldRows(output, instance_fields, false);
        output << "]}";

        std::cout << output.str();
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << error.what();
        return 10;
    }
}
