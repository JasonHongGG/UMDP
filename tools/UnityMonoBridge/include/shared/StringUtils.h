#pragma once

#include <string_view>
#include <string>
#include <utility>
#include <vector>

namespace bridge::shared {

std::string ToLowerAscii(std::string value);
std::wstring ToLowerAscii(std::wstring value);
std::string Utf16ToUtf8(const std::u16string& value);
std::pair<std::string, std::string> NormalizeClassName(std::string class_namespace, std::string class_name);

} // namespace bridge::shared