#pragma once

#include <string>
#include <utility>

namespace bridge::shared {

std::string ToLowerAscii(std::string value);
std::wstring ToLowerAscii(std::wstring value);
std::pair<std::string, std::string> NormalizeClassName(std::string class_namespace, std::string class_name);

} // namespace bridge::shared