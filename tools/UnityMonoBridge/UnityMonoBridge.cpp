#include <iostream>
#include <fstream>
#include <filesystem>
#include <sstream>
#include <string>
#include <vector>

#include "bridge/BridgeJson.h"
#include "bridge/RuntimeBridge.h"

namespace {

std::string NormalizeProtocolLine(std::string value)
{
    for (char& ch : value) {
        if (ch == '\r' || ch == '\n') {
            ch = ' ';
        }
    }

    return value;
}

const char* ProtocolOperationName(bridge::BridgeOperation operation)
{
    switch (operation) {
    case bridge::BridgeOperation::LoadSceneCatalog:
        return "scene-catalog-load";
    case bridge::BridgeOperation::LoadSceneChildren:
        return "scene-object-children-load";
    case bridge::BridgeOperation::InspectSceneObject:
        return "scene-object-inspect";
    case bridge::BridgeOperation::InvokeMethod:
        return "runtime-method-invoke";
    case bridge::BridgeOperation::SetField:
        return "runtime-field-write";
    default:
        return "analysis-overlay-load";
    }
}

void WriteSessionResponse(const std::string& status, const std::string& payload)
{
    std::cout << status << '\n' << NormalizeProtocolLine(payload) << '\n' << std::flush;
}

void WriteSessionEnvelopeResponse(const std::string& status, const std::string& correlation_id, const std::string& payload)
{
    std::cout
        << status << '\n'
        << NormalizeProtocolLine(correlation_id) << '\n'
        << NormalizeProtocolLine(payload) << '\n'
        << std::flush;
}

std::string ExecuteRequest(bridge::RuntimeBridge& runtime_bridge, const bridge::BridgeRequest& request)
{
    if (request.operation == bridge::BridgeOperation::LoadSceneCatalog) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteSceneCatalog(request));
    }
    if (request.operation == bridge::BridgeOperation::LoadSceneChildren) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteSceneChildren(request));
    }
    if (request.operation == bridge::BridgeOperation::InspectSceneObject) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteSceneInspect(request));
    }
    if (request.operation == bridge::BridgeOperation::InvokeMethod) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteInvoke(request));
    }
    if (request.operation == bridge::BridgeOperation::SetField) {
        return bridge::SerializeResponse(runtime_bridge.ExecuteSetField(request));
    }
    return bridge::SerializeResponse(runtime_bridge.Execute(request));
}

int RunSessionMode()
{
    bridge::RuntimeBridge runtime_bridge;
    std::string line;

    while (std::getline(std::cin, line)) {
        if (line == "QUIT") {
            return 0;
        }

        if (line == "PING") {
            WriteSessionResponse("OK", "PONG");
            continue;
        }

        try {
            if (line == "REQ2") {
                std::string correlation_id;
                std::string operation_name;

                if (!std::getline(std::cin, correlation_id)) {
                    throw std::runtime_error("Missing session request correlation id");
                }

                if (!std::getline(std::cin, operation_name)) {
                    throw std::runtime_error("Missing session request operation");
                }

                if (!std::getline(std::cin, line)) {
                    throw std::runtime_error("Missing session argument count");
                }

                const auto count = static_cast<std::size_t>(std::stoull(line));
                std::vector<std::string> args;
                args.reserve(count);
                for (std::size_t index = 0; index < count; ++index) {
                    if (!std::getline(std::cin, line)) {
                        throw std::runtime_error("Unexpected end of session request");
                    }
                    args.push_back(line);
                }

                const auto request = bridge::ArgumentParser::Parse(args);
                if (operation_name != ProtocolOperationName(request.operation)) {
                    throw std::runtime_error("Session request operation does not match parsed bridge request");
                }

                WriteSessionEnvelopeResponse("OK2", correlation_id, ExecuteRequest(runtime_bridge, request));
                continue;
            }

            if (line != "REQ") {
                throw std::runtime_error("Invalid session request preamble");
            }

            if (!std::getline(std::cin, line)) {
                throw std::runtime_error("Missing session argument count");
            }

            const auto count = static_cast<std::size_t>(std::stoull(line));
            std::vector<std::string> args;
            args.reserve(count);
            for (std::size_t index = 0; index < count; ++index) {
                if (!std::getline(std::cin, line)) {
                    throw std::runtime_error("Unexpected end of session request");
                }
                args.push_back(line);
            }

            const auto request = bridge::ArgumentParser::Parse(args);
            WriteSessionResponse("OK", ExecuteRequest(runtime_bridge, request));
        }
        catch (const std::exception& error) {
            WriteSessionResponse("ERR", error.what());
        }
    }

    return 0;
}

std::string ReadFixtureFile(const std::filesystem::path& path)
{
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("Failed to open fixture file: " + path.string());
    }

    std::ostringstream output;
    output << input.rdbuf();
    return output.str();
}

int RunFixtureValidation(const std::filesystem::path& fixture_directory)
{
    const bridge::RuntimeClassOverlayResponse overlay_response{
        .static_fields = { bridge::FieldRow{ "speed", "System.Single", std::string("0x1000"), std::string("1.5"), std::nullopt } },
        .fields = { bridge::FieldRow{ "health", "System.Int32", std::string("0x2020"), std::string("150"), std::string("0x20") } },
    };

    const bridge::RuntimeMethodInvokeResponse invoke_response{
        .success = true,
        .method_name = "Move",
        .method_signature = "System.Void (System.Single x)",
        .return_type = "System.Void",
        .error = std::nullopt,
        .exception = std::nullopt,
        .result = bridge::InvokeValue{ "void", std::nullopt, std::nullopt },
    };

    const bridge::RuntimeFieldSetResponse field_set_response{
        .success = true,
        .failure_kind = bridge::RuntimeFieldSetFailureKind::None,
        .field_name = "speed",
        .field_type = "System.Single",
        .is_static = false,
        .address = std::string("0x2000"),
        .error = std::nullopt,
        .previous_value = std::string("1.5"),
        .applied_value = std::string("2.5"),
    };

    const auto overlay_fixture = ReadFixtureFile(fixture_directory / "runtime-overlay-response.json");
    const auto invoke_fixture = ReadFixtureFile(fixture_directory / "runtime-invoke-response.json");
    const auto field_set_fixture = ReadFixtureFile(fixture_directory / "runtime-field-set-response.json");

    if (bridge::SerializeResponse(overlay_response) != overlay_fixture) {
        throw std::runtime_error("Native runtime overlay fixture mismatch");
    }

    if (bridge::SerializeResponse(invoke_response) != invoke_fixture) {
        throw std::runtime_error("Native runtime invoke fixture mismatch");
    }

    if (bridge::SerializeResponse(field_set_response) != field_set_fixture) {
        throw std::runtime_error("Native runtime field-set fixture mismatch");
    }

    std::cout << "native-contract-fixtures-ok" << std::endl;
    return 0;
}

}

int main(int argc, char* argv[])
{
    try {
        if (argc == 2 && std::string(argv[1]) == "--session") {
            return RunSessionMode();
        }

        if (argc == 3 && std::string(argv[1]) == "--validate-fixtures") {
            return RunFixtureValidation(argv[2]);
        }

        const auto request = bridge::ArgumentParser::Parse(argc, argv);
        const bridge::RuntimeBridge runtime_bridge;
        std::cout << ExecuteRequest(const_cast<bridge::RuntimeBridge&>(runtime_bridge), request);
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << error.what();
        return 10;
    }
}
