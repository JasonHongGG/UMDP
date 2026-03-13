#include "bridge/RuntimeBridge.h"

#include "mono/RuntimeInspector.h"

#include <stdexcept>
#include <string>

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
    mono::RuntimeInspector inspector(request.pid);
    return inspector.InspectClass(request);
}

} // namespace bridge