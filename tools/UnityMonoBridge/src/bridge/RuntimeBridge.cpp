#include "bridge/RuntimeBridge.h"

#include "runtime/services/RuntimeInspector.h"

#include <stdexcept>
#include <string>
#include <vector>

namespace bridge {

namespace {

template <typename TValue>
TValue ParseUnsignedValue(const std::string& value)
{
    return static_cast<TValue>(std::stoull(value, nullptr, 0));
}

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

FieldValueKind ParseFieldValueKind(const std::string& value)
{
    if (value == "boolean") {
        return FieldValueKind::Boolean;
    }
    if (value == "integer") {
        return FieldValueKind::Integer;
    }
    if (value == "float") {
        return FieldValueKind::Float;
    }
    if (value == "string") {
        return FieldValueKind::String;
    }
    if (value == "address") {
        return FieldValueKind::Address;
    }

    return FieldValueKind::Null;
}

BridgeRequest ParseTokens(const std::vector<std::string>& tokens)
{
    BridgeRequest request;
    for (std::size_t index = 0; index + 1 < tokens.size(); index += 2) {
        const std::string& key = tokens[index];
        const std::string& value = tokens[index + 1];

        if (key == "--pid") {
            request.pid = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--operation") {
            if (value == "invoke") {
                request.operation = BridgeOperation::InvokeMethod;
            }
            else if (value == "set-field") {
                request.operation = BridgeOperation::SetField;
            }
            else {
                request.operation = BridgeOperation::InspectClass;
            }
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
            request.instance_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--method-name") {
            request.method_name = value;
        }
        else if (key == "--method-signature") {
            request.method_signature = value;
        }
        else if (key == "--field-name") {
            request.field_name = value;
        }
        else if (key == "--field-type") {
            request.field_type_name = value;
        }
        else if (key == "--field-static") {
            request.field_is_static = value == "true";
        }
        else if (key == "--target-address") {
            request.target_address = ParseUnsignedValue<std::size_t>(value);
        }
        else if (key == "--value-kind") {
            request.field_value_kind = ParseFieldValueKind(value);
        }
        else if (key == "--field-value") {
            request.field_value = value;
        }
        else if (key == "--arg-kind") {
            InvokeArgument argument;
            argument.kind = ParseInvokeValueKind(value);
            if (index + 3 < tokens.size() && tokens[index + 2] == "--arg-value") {
                argument.value = tokens[index + 3];
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

    if (request.operation == BridgeOperation::SetField && (request.field_name.empty() || request.field_type_name.empty())) {
        throw std::runtime_error("Missing field write arguments");
    }

    return request;
}

} // namespace

BridgeRequest ArgumentParser::Parse(int argc, char* argv[])
{
    std::vector<std::string> args;
    args.reserve(static_cast<std::size_t>(argc > 1 ? argc - 1 : 0));
    for (int index = 1; index < argc; ++index) {
        args.emplace_back(argv[index]);
    }

    return Parse(args);
}

BridgeRequest ArgumentParser::Parse(const std::vector<std::string>& args)
{
    return ParseTokens(args);
}

runtime::RuntimeInspector& RuntimeBridge::ResolveInspector(std::size_t pid)
{
    if (!inspector_ || !active_pid_.has_value() || *active_pid_ != pid) {
        inspector_ = std::make_unique<runtime::RuntimeInspector>(pid);
        active_pid_ = pid;
    }

    return *inspector_;
}

RuntimeClassOverlayResponse RuntimeBridge::Execute(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).InspectClass(request);
}

RuntimeMethodInvokeResponse RuntimeBridge::ExecuteInvoke(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).InvokeClassMethod(request);
}

RuntimeFieldSetResponse RuntimeBridge::ExecuteSetField(const BridgeRequest& request)
{
    return ResolveInspector(request.pid).SetFieldValue(request);
}

} // namespace bridge
