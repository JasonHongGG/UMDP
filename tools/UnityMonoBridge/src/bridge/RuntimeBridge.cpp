#include "bridge/RuntimeBridge.h"

#include "runtime/services/RuntimeInspector.h"

#include <stdexcept>
#include <string>

namespace bridge {

namespace {

InvokeValueKind ParseInvokeValueKind(const std::string& value)
{
    if (value == "boolean") {
        return InvokeValueKind::Boolean;
    }
    if (value == "number") {
        return InvokeValueKind::Number;
    }
    if (value == "string") {
        return InvokeValueKind::String;
    }

    return InvokeValueKind::Null;
}

}

BridgeRequest ArgumentParser::Parse(int argc, char* argv[])
{
    BridgeRequest request;
    for (int index = 1; index + 1 < argc; index += 2) {
        const std::string key = argv[index];
        const std::string value = argv[index + 1];
        if (key == "--pid") {
            request.pid = static_cast<std::size_t>(std::stoull(value));
        }
        else if (key == "--operation") {
            request.operation = value == "invoke" ? BridgeOperation::InvokeMethod : BridgeOperation::InspectClass;
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
        else if (key == "--instance") {
            request.instance_address = static_cast<std::size_t>(std::stoull(value, nullptr, 0));
        }
        else if (key == "--method-name") {
            request.method_name = value;
        }
        else if (key == "--method-signature") {
            request.method_signature = value;
        }
        else if (key == "--arg-kind") {
            InvokeArgument argument;
            argument.kind = ParseInvokeValueKind(value);
            if (index + 3 < argc && std::string(argv[index + 2]) == "--arg-value") {
                argument.value = std::string(argv[index + 3]);
                index += 2;
            }
            request.arguments.push_back(std::move(argument));
        }
    }

    if (request.pid == 0 || request.image_name.empty() || request.class_name.empty()) {
        throw std::runtime_error("Missing required arguments");
    }

    if (request.operation == BridgeOperation::InvokeMethod && (request.method_name.empty() || request.method_signature.empty())) {
        throw std::runtime_error("Missing method invocation arguments");
    }

    return request;
}

RuntimeClassOverlayResponse RuntimeBridge::Execute(const BridgeRequest& request) const
{
    runtime::RuntimeInspector inspector(request.pid);
    return inspector.InspectClass(request);
}

RuntimeMethodInvokeResponse RuntimeBridge::ExecuteInvoke(const BridgeRequest& request) const
{
    runtime::RuntimeInspector inspector(request.pid);
    return inspector.InvokeClassMethod(request);
}

} // namespace bridge