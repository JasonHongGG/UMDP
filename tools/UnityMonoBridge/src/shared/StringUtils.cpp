#include "shared/StringUtils.h"

#include <Windows.h>

#include <algorithm>
#include <cctype>
#include <cwctype>
#include <stdexcept>

namespace bridge::shared {

std::string ToLowerAscii(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

std::wstring ToLowerAscii(std::wstring value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) {
        return static_cast<wchar_t>(::towlower(ch));
    });
    return value;
}

std::string Utf16ToUtf8(const std::u16string& value)
{
    if (value.empty()) {
        return {};
    }

    const auto* source = reinterpret_cast<const wchar_t*>(value.data());
    const int required = WideCharToMultiByte(CP_UTF8, 0, source, static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (required <= 0) {
        throw std::runtime_error("failed to convert utf16 string to utf8");
    }

    std::string result(static_cast<std::size_t>(required), '\0');
    WideCharToMultiByte(CP_UTF8, 0, source, static_cast<int>(value.size()), result.data(), required, nullptr, nullptr);
    return result;
}

std::pair<std::string, std::string> NormalizeClassName(std::string class_namespace, std::string class_name)
{
    if (class_namespace.empty()) {
        const auto last_dot = class_name.rfind('.');
        if (last_dot != std::string::npos) {
            class_namespace = class_name.substr(0, last_dot);
            class_name = class_name.substr(last_dot + 1);
        }
    }

    std::replace(class_name.begin(), class_name.end(), '+', '/');
    return { std::move(class_namespace), std::move(class_name) };
}

} // namespace bridge::shared